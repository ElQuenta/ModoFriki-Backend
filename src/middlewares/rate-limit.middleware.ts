import type { Request, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import config from "../config/env";
import { ErrorResponseHandler } from "../handlers/error.handler";
import AppError from "../utils/AppError";

// ponytail: in-memory store per instance; with several Render instances, move to a shared store (Redis).
export function createRateLimit(windowMs: number, limit: number, message: string, skip?: (req: Request) => boolean): RequestHandler {
	return rateLimit({
		windowMs,
		limit,
		skip,
		standardHeaders: "draft-8",
		legacyHeaders: false,
		handler: (_req, res) => ErrorResponseHandler(res, new AppError(message, 429))
	});
}

export const apiRateLimit = createRateLimit(60_000, config.rateLimit.apiPerMinute, "Too many requests");
// Brute force on login and account spam on register.
export const authRateLimit = createRateLimit(15 * 60_000, config.rateLimit.authPer15Minutes, "Too many authentication attempts");
// Anonymous visits/reads can be inflated with fresh idempotency keys. A sent token is validated by
// optionalAuthenticate (invalid → 401), so only truly anonymous events are limited here.
export const anonymousEventRateLimit = createRateLimit(60_000, config.rateLimit.eventsPerMinute, "Too many events", req => Boolean(req.headers.authorization));
