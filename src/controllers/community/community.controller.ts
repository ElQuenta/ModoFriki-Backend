import type { RequestHandler, Response } from "express";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { CreatedResponseHandler, NoContentResponseHandler, SuccessResponseHandler } from "../../handlers/success.handler";
import { communityService, type CommunityService } from "../../services/community/community.service";
import type { AuthUser } from "../../types/express";
import AppError from "../../utils/AppError";
import { createLogger } from "../../utils/logger";

const logger = createLogger("CommunityController");
type Service = Pick<CommunityService, "list" | "create" | "edit" | "remove" | "setVote" | "removeVote" | "report" | "listReports" | "resolveReport">;

export class CommunityController {
	constructor(private readonly service: Service = communityService) {}

	private actor(res: Response): AuthUser {
		if (!res.locals.authenticated || !res.locals.user) throw new AppError("Authentication required", 401);
		return { id: res.locals.user.id, role: res.locals.user.role };
	}

	list: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment listing");
			SuccessResponseHandler(res, await this.service.list(req.query));
		} catch (error) { logger.error("Unable to list comments"); ErrorResponseHandler(res, error); }
	};
	create: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment creation");
			const raw = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === "idempotency-key");
			const header = req.header("idempotency-key");
			if (raw.length > 1 || (header !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(header))) throw new AppError("Invalid Idempotency-Key", 400);
			CreatedResponseHandler(res, await this.service.create(req.body, this.actor(res), header?.toLowerCase()));
		} catch (error) { logger.error("Unable to create comment"); ErrorResponseHandler(res, error); }
	};
	edit: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment edit");
			SuccessResponseHandler(res, await this.service.edit(req.params.id, req.body, this.actor(res)));
		} catch (error) { logger.error("Unable to edit comment"); ErrorResponseHandler(res, error); }
	};
	remove: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment deletion");
			await this.service.remove(req.params.id, this.actor(res));
			NoContentResponseHandler(res);
		} catch (error) { logger.error("Unable to delete comment"); ErrorResponseHandler(res, error); }
	};
	setVote: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment vote");
			SuccessResponseHandler(res, await this.service.setVote(req.params.id, req.body, this.actor(res)));
		} catch (error) { logger.error("Unable to set vote"); ErrorResponseHandler(res, error); }
	};
	removeVote: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling vote removal");
			await this.service.removeVote(req.params.id, this.actor(res));
			NoContentResponseHandler(res);
		} catch (error) { logger.error("Unable to remove vote"); ErrorResponseHandler(res, error); }
	};
	report: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment report");
			CreatedResponseHandler(res, await this.service.report(req.params.id, req.body, this.actor(res)));
		} catch (error) { logger.error("Unable to report comment"); ErrorResponseHandler(res, error); }
	};
	listReports: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling moderation listing");
			SuccessResponseHandler(res, await this.service.listReports(req.query, this.actor(res)));
		} catch (error) { logger.error("Unable to list reports"); ErrorResponseHandler(res, error); }
	};
	resolveReport: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling report resolution");
			SuccessResponseHandler(res, await this.service.resolveReport(req.params.id, req.body, this.actor(res)));
		} catch (error) { logger.error("Unable to resolve report"); ErrorResponseHandler(res, error); }
	};
}
