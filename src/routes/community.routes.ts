import { Router } from "express";
import { CommunityController } from "../controllers/community/community.controller";
import { createAuthenticate, createOptionalAuthenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateBody } from "../middlewares/validatebody.middleware";
import {
	createCommentBodySchema, createReportBodySchema, editCommentBodySchema,
	resolveReportBodySchema, voteBodySchema
} from "../middlewares/schemas/community.schema";
import { authService, type AuthService } from "../services/auth/auth.service";
import { communityService, type CommunityService } from "../services/community/community.service";

type Service = Pick<CommunityService, "list" | "create" | "edit" | "remove" | "setVote" | "removeVote" | "report" | "listReports" | "resolveReport">;

export function createCommunityRouter(service: Service = communityService, authentication: Pick<AuthService, "authenticateToken"> = authService): Router {
	const router = Router();
	const controller = new CommunityController(service);
	const authenticate = createAuthenticate(authentication);

	router.route("/comments")
		.get(createOptionalAuthenticate(authentication), controller.list)
		.post(authenticate, validateBody(createCommentBodySchema), controller.create);

	router.route("/comments/:id")
		.all(authenticate)
		.patch(validateBody(editCommentBodySchema), controller.edit)
		.delete(controller.remove);
	router.route("/comments/:id/vote")
		.all(authenticate)
		.put(validateBody(voteBodySchema), controller.setVote)
		.delete(controller.removeVote);
	router.route("/comments/:id/reports")
		.post(authenticate, validateBody(createReportBodySchema), controller.report);

	router.route("/comment-reports")
		.get(authenticate, authorize(["ADMIN"]), controller.listReports);
	router.route("/comment-reports/:id")
		.patch(authenticate, authorize(["ADMIN"]), validateBody(resolveReportBodySchema), controller.resolveReport);
	return router;
}

export default createCommunityRouter();
