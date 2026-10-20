import type { RequestHandler } from "express";
import { catchAndLogError, createLogger } from "../utils/logger";

const httpLogger = createLogger("HTTP");

const loggerMiddleware: RequestHandler = (request, response, next) => {
	try {
		const startedAt = process.hrtime.bigint();
		const requestData = { method: request.method, endpoint: request.path };
		httpLogger.http("Request started", requestData);
		response.on("finish", () => {
			const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
			httpLogger.http("Request completed", {
				...requestData,
				statusCode: response.statusCode,
				durationMs: Number(durationMs.toFixed(2))
			});
		});
		next();
	} catch (error) {
		return catchAndLogError(httpLogger, error, "Unable to log request");
	}
};

export default loggerMiddleware;
