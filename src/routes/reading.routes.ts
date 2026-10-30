import { Router } from "express";
import { ReadingController } from "../controllers/reading/reading.controller";
import { createAuthenticate, createOptionalAuthenticate } from "../middlewares/auth.middleware";
import { anonymousEventRateLimit } from "../middlewares/rate-limit.middleware";
import { authService, type AuthService } from "../services/auth/auth.service";
import { readingService, type ReadingService } from "../services/reading/reading.service";

export function createReadingRouter(service: ReadingService = readingService, auth: Pick<AuthService, "authenticateToken"> = authService): Router {
	const router = Router();
	const authenticate = createAuthenticate(auth);
	const optionalAuthenticate = createOptionalAuthenticate(auth);
	const controller = new ReadingController(service);
	router.post("/works/:workId/visits", anonymousEventRateLimit, optionalAuthenticate, controller.recordVisit);
	router.get("/works/:workId/stats", controller.getWorkStats);
	router.route("/works/:workId/rating").put(authenticate, controller.setRating).delete(authenticate, controller.removeRating);
	router.post("/chapters/:chapterId/read-events", anonymousEventRateLimit, optionalAuthenticate, controller.recordRead);
	router.route("/me/read-chapters/:chapterId").put(authenticate, controller.markRead).delete(authenticate, controller.unmarkRead);
	router.get("/me/favorites", authenticate, controller.listFavorites);
	router.route("/me/favorites/:workId").put(authenticate, controller.setFavorite).delete(authenticate, controller.removeFavorite);
	router.get("/me/reading-history", authenticate, controller.listHistory);
	router.get("/me/reading-stats", authenticate, controller.getStats);
	router.get("/me/reading-calendar", authenticate, controller.getCalendar);
	router.get("/me/works/:workId/progress", authenticate, controller.getProgress);
	return router;
}

export default createReadingRouter();
