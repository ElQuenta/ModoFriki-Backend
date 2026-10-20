import { Router } from "express";
import { DiscoveryController } from "../controllers/discovery/discovery.controller";
import { discoveryService, type DiscoveryService } from "../services/discovery/discovery.service";

export function createDiscoveryRouter(service: DiscoveryService = discoveryService): Router {
	const router = Router();
	const controller = new DiscoveryController(service);
	router.get("/chapters/latest", controller.listLatestChapters);
	return router;
}

export default createDiscoveryRouter();
