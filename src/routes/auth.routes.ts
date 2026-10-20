import { Router } from "express";
import { AuthController } from "../controllers/auth/auth.controller";
import { createAuthenticate } from "../middlewares/auth.middleware";
import { authService, type AuthService } from "../services/auth/auth.service";

export function createAuthRouter(service: Pick<AuthService, "register" | "login" | "me" | "authenticateToken"> = authService): Router {
	const router = Router();
	const controller = new AuthController(service);
	router.post("/register", controller.register);
	router.post("/login", controller.login);
	router.get("/me", createAuthenticate(service), controller.me);
	return router;
}

export default createAuthRouter();
