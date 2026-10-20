import type { RequestHandler, Response } from "express";
import { CreatedResponseHandler, NoContentResponseHandler, SuccessResponseHandler } from "../../handlers/success.handler";
import { communityService, type CommunityService } from "../../services/community/community.service";
import type { AuthUser } from "../../types/express";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("CommunityController");
type Service = Pick<CommunityService, "list" | "create" | "edit" | "remove" | "setVote" | "removeVote" | "report" | "listReports" | "resolveReport">;

export class CommunityController {
	constructor(private readonly service: Service = communityService) {}

	private actor(res: Response): AuthUser {
		try {
			if (!res.locals.authenticated || !res.locals.user) throw new AppError("Authentication required", 401);
			return { id: res.locals.user.id, role: res.locals.user.role };
		} catch (error) { return catchAndLogError(logger, error, "Unable to read current actor"); }
	}

	list: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment listing");
			SuccessResponseHandler(res, await this.service.list(req.query));
		} catch (error) { return catchAndLogError(logger, error, "Unable to list comments"); }
	};
	create: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment creation");
			CreatedResponseHandler(res, await this.service.create(req.body, this.actor(res)));
		} catch (error) { return catchAndLogError(logger, error, "Unable to create comment"); }
	};
	edit: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment edit");
			SuccessResponseHandler(res, await this.service.edit(req.params.id, req.body, this.actor(res)));
		} catch (error) { return catchAndLogError(logger, error, "Unable to edit comment"); }
	};
	remove: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment deletion");
			await this.service.remove(req.params.id, this.actor(res));
			NoContentResponseHandler(res);
		} catch (error) { return catchAndLogError(logger, error, "Unable to delete comment"); }
	};
	setVote: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment vote");
			SuccessResponseHandler(res, await this.service.setVote(req.params.id, req.body, this.actor(res)));
		} catch (error) { return catchAndLogError(logger, error, "Unable to set vote"); }
	};
	removeVote: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling vote removal");
			await this.service.removeVote(req.params.id, this.actor(res));
			NoContentResponseHandler(res);
		} catch (error) { return catchAndLogError(logger, error, "Unable to remove vote"); }
	};
	report: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling comment report");
			CreatedResponseHandler(res, await this.service.report(req.params.id, req.body, this.actor(res)));
		} catch (error) { return catchAndLogError(logger, error, "Unable to report comment"); }
	};
	listReports: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling moderation listing");
			SuccessResponseHandler(res, await this.service.listReports(req.query, this.actor(res)));
		} catch (error) { return catchAndLogError(logger, error, "Unable to list reports"); }
	};
	resolveReport: RequestHandler = async (req, res) => {
		try {
			logger.debug("Handling report resolution");
			SuccessResponseHandler(res, await this.service.resolveReport(req.params.id, req.body, this.actor(res)));
		} catch (error) { return catchAndLogError(logger, error, "Unable to resolve report"); }
	};
}
