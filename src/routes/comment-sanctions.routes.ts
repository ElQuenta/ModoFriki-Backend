import { Router } from "express";
import { CommentSanctionsController } from "../controllers/community/comment-sanctions.controller";
import { createAuthenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateBody } from "../middlewares/validatebody.middleware";
import { validateParams } from "../middlewares/validateParams.middleware";
import { validateQuery } from "../middlewares/validateQuery.middleware";
import { commentSanctionParamsSchema, commentSanctionUserParamsSchema, commentSanctionsQuerySchema, imposeCommentSanctionBodySchema, revokeCommentSanctionBodySchema } from "../middlewares/schemas/comment-sanctions.schema";
import { authService, type AuthService } from "../services/auth/auth.service";
import { commentSanctionService, type CommentSanctionService } from "../services/community/comment-sanction.service";

type Service = Pick<CommentSanctionService, "list" | "impose" | "revoke">;
export function createCommentSanctionsRouter(service: Service = commentSanctionService, authentication: Pick<AuthService, "authenticateToken"> = authService): Router {
	const router = Router(); const controller = new CommentSanctionsController(service as CommentSanctionService);
	const guard = [createAuthenticate(authentication), authorize(["ADMIN"])] as const;
	router.route("/admin/users/:userId/comment-sanctions")
		.get(...guard, validateParams(commentSanctionUserParamsSchema), validateQuery(commentSanctionsQuerySchema), controller.list)
		.post(...guard, validateParams(commentSanctionUserParamsSchema), validateBody(imposeCommentSanctionBodySchema), controller.impose);
	router.put("/admin/users/:userId/comment-sanctions/:sanctionId/revocation", ...guard, validateParams(commentSanctionParamsSchema), validateBody(revokeCommentSanctionBodySchema), controller.revoke);
	return router;
}
export default createCommentSanctionsRouter();
