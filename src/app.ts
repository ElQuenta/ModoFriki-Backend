import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { serve, setup } from "swagger-ui-express";
import { parse } from "yaml";
import config from "./config/env";
import { isPostgresUp } from "./config/database/postgres";
import { isMongoUp } from "./config/database/mongodb";
import { ErrorResponseHandler } from "./handlers/error.handler";
import { SuccessResponseHandler } from "./handlers/success.handler";
import loggerMiddleware from "./middlewares/logger.middleware";
import { apiRateLimit, authRateLimit } from "./middlewares/rate-limit.middleware";
import authRouter from "./routes/auth.routes";
import communityRouter from "./routes/community.routes";
import discoveryRouter from "./routes/discovery.routes";
import catalogRouter from "./routes/catalog.routes";
import readingRouter from "./routes/reading.routes";
import AppError from "./utils/AppError";
import { createLogger } from "./utils/logger";

const logger = createLogger("App");
const allowedOrigins = ["http://localhost:5173", config.frontendUrl].filter((origin) => origin !== undefined);
const openApiSpec = parse(readFileSync(resolve(__dirname, "..", "openapi.yaml"), "utf8"));
const bodyErrorMessages: Record<string, string> = {
	"entity.parse.failed": "Malformed JSON body",
	"entity.too.large": "Payload too large"
};

const app = express();
app.set("trust proxy", config.trustProxy);

app.use(helmet());
app.use(loggerMiddleware);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/", (_request, response) => {
	SuccessResponseHandler(response, { status: "ok" });
});

// Render health check: 503 when a database is down (no hosts or credentials in the body). GET / stays DB-free.
app.get("/health", async (_request, response) => {
	const [postgresUp, mongoUp] = await Promise.all([isPostgresUp(), Promise.resolve(isMongoUp())]);
	const data = { status: postgresUp && mongoUp ? "ok" : "degraded", postgres: postgresUp ? "ok" : "down", mongo: mongoUp ? "ok" : "down" };
	if (data.status === "ok") SuccessResponseHandler(response, data);
	else response.status(503).json({ success: false, code: 503, error: { message: "Service unavailable" }, data });
});

app.use("/api/docs", serve, setup(openApiSpec));
app.use("/api", apiRateLimit);
app.use(["/api/auth/login", "/api/auth/register"], authRateLimit);
app.use("/api/auth", authRouter);
app.use("/api", communityRouter);
app.use("/api", discoveryRouter);
app.use("/api", catalogRouter);
app.use("/api", readingRouter);

app.use((_request, response) => {
	ErrorResponseHandler(response, new AppError("Route not found", 404));
});

// Express solo lo reconoce como error handler si declara los 4 parámetros.
const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
	if (response.headersSent) {
		next(error);
		return;
	}

	// Errores 4xx de body-parser (JSON malformado, body grande, charset) y de decodificación de params.
	const status: unknown = error?.status;
	if (typeof status === "number" && status >= 400 && status < 500) {
		ErrorResponseHandler(response, new AppError(bodyErrorMessages[error.type] ?? error.message, status));
		return;
	}

	logger.error("Unhandled error", {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined
	});
	ErrorResponseHandler(response, error);
};

app.use(errorHandler);

export default app;
