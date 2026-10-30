import { Router } from "express";
import { AuthController } from "../controllers/auth/auth.controller";
import { createAuthenticate } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validatebody.middleware";
import { loginBodySchema, registerBodySchema } from "../middlewares/schemas/auth.schema";
import { authService, type AuthService } from "../services/auth/auth.service";
import { CommentSanctionsController } from "../controllers/community/comment-sanctions.controller";
import { commentSanctionService } from "../services/community/comment-sanction.service";

export function createAuthRouter(service: Pick<AuthService, "register" | "login" | "me" | "authenticateToken"> = authService): Router {
	const router = Router();
	const controller = new AuthController(service);
	const sanctions = new CommentSanctionsController(commentSanctionService);
	router.route("/register").post(validateBody(registerBodySchema), controller.register);
	router.route("/login").post(validateBody(loginBodySchema), controller.login);
	router.route("/me")
		.get(createAuthenticate(service), controller.me);
	router.route("/me/comment-restriction")
		.get(createAuthenticate(service), sanctions.ownRestriction);
	return router;
}

export default createAuthRouter();
