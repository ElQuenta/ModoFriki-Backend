import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { serve, setup } from "swagger-ui-express";
import { parse } from "yaml";
import config from "./config/env";
import { ErrorResponseHandler } from "./handlers/error.handler";
import { SuccessResponseHandler } from "./handlers/success.handler";
import loggerMiddleware from "./middlewares/logger.middleware";
import authRouter from "./routes/auth.routes";
import communityRouter from "./routes/community.routes";
import AppError from "./utils/AppError";
import { createLogger } from "./utils/logger";

const logger = createLogger("App");
const allowedOrigins = ["http://localhost:5173", config.frontendUrl].filter((origin) => origin !== undefined);
// Vale desde src/ (tsx) y desde dist/ (build). Un YAML inválido tumba el arranque a propósito.
const openApiSpec = parse(readFileSync(resolve(__dirname, "..", "openapi.yaml"), "utf8"));
const bodyErrorMessages: Record<string, string> = {
	"entity.parse.failed": "Malformed JSON body",
	"entity.too.large": "Payload too large"
};

const app = express();

app.use(loggerMiddleware);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/health", (_request, response) => {
	SuccessResponseHandler(response, { status: "ok" });
});

app.use("/api/docs", serve, setup(openApiSpec));
app.use("/api/auth", authRouter);
app.use("/api", communityRouter);

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
	if (error instanceof AppError) {
		logger.warn("Request failed", { statusCode: error.statusCode });
		ErrorResponseHandler(response, error);
		return;
	}
	const status: unknown = error?.status;
	if (typeof status === "number" && status >= 400 && status < 500) {
		ErrorResponseHandler(response, new AppError(bodyErrorMessages[error.type] ?? "Invalid request", status));
		return;
	}

	logger.error("Unhandled request error");
	ErrorResponseHandler(response, error);
};

app.use(errorHandler);

export default app;
