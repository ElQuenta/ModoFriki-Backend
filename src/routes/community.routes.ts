import { Router } from "express";
import { CommunityController } from "../controllers/community/community.controller";
import { createAuthenticate, createOptionalAuthenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { authService, type AuthService } from "../services/auth/auth.service";
import { communityService, type CommunityService } from "../services/community/community.service";

type Service = Pick<CommunityService, "list" | "create" | "edit" | "remove" | "setVote" | "removeVote" | "report" | "listReports" | "resolveReport">;

export function createCommunityRouter(service: Service = communityService, authentication: Pick<AuthService, "authenticateToken"> = authService): Router {
	const router = Router();
	const controller = new CommunityController(service);
	const authenticate = createAuthenticate(authentication);
	router.get("/comments", createOptionalAuthenticate(authentication), controller.list);
	router.post("/comments", authenticate, controller.create);
	router.patch("/comments/:id", authenticate, controller.edit);
	router.delete("/comments/:id", authenticate, controller.remove);
	router.put("/comments/:id/vote", authenticate, controller.setVote);
	router.delete("/comments/:id/vote", authenticate, controller.removeVote);
	router.post("/comments/:id/reports", authenticate, controller.report);
	router.get("/comment-reports", authenticate, authorize(["ADMIN"]), controller.listReports);
	router.patch("/comment-reports/:id", authenticate, authorize(["ADMIN"]), controller.resolveReport);
	return router;
}

export default createCommunityRouter();
