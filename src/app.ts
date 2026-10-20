import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { serve, setup } from "swagger-ui-express";
import { parse } from "yaml";
import { ErrorResponseHandler } from "./handlers/error.handler";
import { SuccessResponseHandler } from "./handlers/success.handler";
import loggerMiddleware from "./middlewares/logger.middleware";
import authRouter from "./routes/auth.routes";
import communityRouter from "./routes/community.routes";
import catalogRouter from "./routes/catalog.routes";
import readingRouter from "./routes/reading.routes";
import AppError from "./utils/AppError";
import { createLogger } from "./utils/logger";

const logger = createLogger("App");
const openApiSpec = parse(readFileSync(resolve(__dirname, "..", "openapi.yaml"), "utf8"));
const bodyErrorMessages: Record<string, string> = {
	"entity.parse.failed": "Malformed JSON body",
	"entity.too.large": "Payload too large"
};

const app = express();

app.use(loggerMiddleware);
app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
	SuccessResponseHandler(response, { status: "ok" });
});

app.use("/api/docs", serve, setup(openApiSpec));
app.use("/api/auth", authRouter);
app.use("/api", communityRouter);
app.use("/api", catalogRouter);
app.use("/api", readingRouter);

app.use((_request, response) => {
	ErrorResponseHandler(response, new AppError("Route not found", 404));
});


export default app;
