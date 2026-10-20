import type { RequestHandler } from "express";
import { CreatedResponseHandler, SuccessResponseHandler } from "../../handlers/success.handler";
import { authService, type AuthService } from "../../services/auth/auth.service";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("AuthController");
type Service = Pick<AuthService, "register" | "login" | "me">;

export class AuthController {
	constructor(private readonly service: Service = authService) {}

	register: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling registration");
			CreatedResponseHandler(res, await this.service.register(req.body));
		} catch (error) { return catchAndLogError(logger, error, "Unable to register user"); }
	};

	login: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling login");
			SuccessResponseHandler(res, await this.service.login(req.body));
		} catch (error) { return catchAndLogError(logger, error, "Unable to login"); }
	};

	me: RequestHandler = async (_req, res) => {
		try {
			logger.debug("Handling identity request");
			if (!res.locals.user) throw new AppError("Authentication required", 401);
			SuccessResponseHandler(res, await this.service.me(res.locals.user.id));
		} catch (error) { return catchAndLogError(logger, error, "Unable to read identity"); }
	};
}
