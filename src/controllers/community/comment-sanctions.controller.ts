import type { RequestHandler, Response } from "express";
import { CreatedResponseHandler, SuccessResponseHandler } from "../../handlers/success.handler";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { commentSanctionService, type CommentSanctionService } from "../../services/community/comment-sanction.service";
import type { AuthUser } from "../../types/express";
import AppError from "../../utils/AppError";

type Service = Pick<CommentSanctionService, "list" | "impose" | "revoke" | "getOwnRestriction">;
export class CommentSanctionsController {
	constructor(private readonly service: Service = commentSanctionService) {}
	private actor(res: Response): AuthUser {
		if (!res.locals.authenticated || !res.locals.user) throw new AppError("Authentication required", 401);
		return { id: res.locals.user.id, role: res.locals.user.role };
	}
	list: RequestHandler = async (req, res) => { try {
		SuccessResponseHandler(res, await this.service.list(this.actor(res), String(req.params.userId), { limit: req.query.limit as number | undefined, cursor: req.query.cursorCreatedAt ? { createdAt: new Date(req.query.cursorCreatedAt as string), id: String(req.query.cursorId) } : undefined }));
	} catch (error) { ErrorResponseHandler(res, error); } };
	impose: RequestHandler = async (req, res) => { try {
		const target = { id: String(req.params.userId), role: "BASIC" };
		CreatedResponseHandler(res, await this.service.impose(this.actor(res), target, req.body));
	} catch (error) { ErrorResponseHandler(res, error); } };
	revoke: RequestHandler = async (req, res) => { try {
		SuccessResponseHandler(res, await this.service.revoke(this.actor(res), String(req.params.userId), String(req.params.sanctionId)));
	} catch (error) { ErrorResponseHandler(res, error); } };
	ownRestriction: RequestHandler = async (_req, res) => { try {
		SuccessResponseHandler(res, await this.service.getOwnRestriction(this.actor(res).id));
	} catch (error) { ErrorResponseHandler(res, error); } };
}
