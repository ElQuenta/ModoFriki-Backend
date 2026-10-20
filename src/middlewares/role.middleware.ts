import type { RequestHandler } from "express";
import type { Role } from "../types/express";
import AppError from "../utils/AppError";
import { catchAndLogError, createLogger } from "../utils/logger";

const logger = createLogger("RoleMiddleware");

export const authorize = (roles: Role[]): RequestHandler => (_req, res, next) => {
	try {
		logger.debug("Checking current database role");
		if (!res.locals.authenticated || !res.locals.user) {
			throw new AppError("Authentication required", 401);
		}
		if (!roles.includes(res.locals.user.role)) {
			throw new AppError("Insufficient permissions", 403);
		}
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to authorize request");
	}

	next();
};
