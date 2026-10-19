import { RequestHandler } from "express";
import { createLogger } from "../utils/logger";

const httpLogger = createLogger("HTTP");

const loggerMiddleware: RequestHandler = (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    const requestData = {
        method: request.method,
        endpoint: request.originalUrl
    };

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
};

export default loggerMiddleware;
