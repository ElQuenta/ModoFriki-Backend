import { Router } from "express";
import { DiscoveryController } from "../controllers/discovery/discovery.controller";
import { createOptionalAuthenticate } from "../middlewares/auth.middleware";
import { authService, type AuthService } from "../services/auth/auth.service";
import { discoveryService, type DiscoveryService } from "../services/discovery/discovery.service";

export function createDiscoveryRouter(service: DiscoveryService = discoveryService, auth: Pick<AuthService, "authenticateToken"> = authService): Router {
	const router = Router();
	const controller = new DiscoveryController(service);
	router.get("/chapters/latest", controller.listLatestChapters);
	router.get("/works/popular", controller.listPopularWorks);
	router.get("/works/recommended", createOptionalAuthenticate(auth), controller.listRecommendedWorks);
	return router;
}

export default createDiscoveryRouter();
