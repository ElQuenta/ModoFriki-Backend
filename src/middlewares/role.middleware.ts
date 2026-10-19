import type { RequestHandler } from "express";
import { ErrorResponseHandler } from "../handlers/error.handler";
import type { Role } from "../types/express";
import AppError from "../utils/AppError";

export const authorize = (roles: Role[]): RequestHandler => (req, res, next) => {
	try {
		if (!req.user) {
			throw new AppError("Authentication required", 401);
		}
		if (!roles.includes(req.user.role)) {
			throw new AppError("Insufficient permissions", 403);
		}
	} catch (error) {
		ErrorResponseHandler(res, error);
		return;
	}

	next();
};
