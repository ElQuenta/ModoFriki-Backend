import type { RequestHandler } from "express";
import { authService, type AuthService } from "../services/auth/auth.service";
import AppError from "../utils/AppError";
import { catchAndLogError, createLogger } from "../utils/logger";

const logger = createLogger("AuthMiddleware");
type AuthenticationService = Pick<AuthService, "authenticateToken">;

export const createAuthenticate = (service: AuthenticationService = authService, optional = false): RequestHandler => async (req, res, next) => {
	try {
		logger.debug("Checking request identity");
		delete req.user;
		delete res.locals.user;
		delete res.locals.authenticated;
		if (optional && req.headers.authorization === undefined) {
			next();
			return;
		}
		const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
		if (!match) throw new AppError("Authentication required", 401);
		const user = await service.authenticateToken(match[1]);
		res.locals.user = user;
		res.locals.authenticated = true;
		req.user = { id: user.id, role: user.role };
		next();
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to authenticate request");
	}
};

export const createOptionalAuthenticate = (service: AuthenticationService = authService): RequestHandler => createAuthenticate(service, true);
export const authenticate = createAuthenticate();
export const optionalAuthenticate = createOptionalAuthenticate();
