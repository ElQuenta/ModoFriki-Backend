import type { RequestHandler } from "express";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { NoContentResponseHandler, SuccessResponseHandler } from "../../handlers/success.handler";
import { readingService, type ReadingService } from "../../services/reading/reading.service";
import { createLogger } from "../../utils/logger";

const logger = createLogger("ReadingController");
const readingDto = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));

export class ReadingController {
	constructor(private readonly service: ReadingService = readingService) {}
	private handle(action: RequestHandler): RequestHandler {
		return async (req, res, next) => {
			try { logger.debug("Handling reading request"); await action(req, res, next); }
			catch (error) { logger.error("Unable to handle reading request"); ErrorResponseHandler(res, error); }
		};
	}
	recordVisit = this.handle(async (req, res) => { SuccessResponseHandler(res, readingDto(await this.service.recordVisit(req.params.workId as string, req.body))); });
	recordRead = this.handle(async (req, res) => { SuccessResponseHandler(res, readingDto(await this.service.recordRead(req.params.chapterId as string, req.body, res.locals.user))); });
	markRead = this.handle(async (req, res) => { SuccessResponseHandler(res, readingDto(await this.service.setReadState(req.params.chapterId as string, true, res.locals.user))); });
	unmarkRead = this.handle(async (req, res) => { await this.service.setReadState(req.params.chapterId as string, false, res.locals.user); NoContentResponseHandler(res); });
	setFavorite = this.handle(async (req, res) => { SuccessResponseHandler(res, await this.service.setFavorite(req.params.workId as string, true, res.locals.user)); });
	removeFavorite = this.handle(async (req, res) => { await this.service.setFavorite(req.params.workId as string, false, res.locals.user); NoContentResponseHandler(res); });
	listFavorites = this.handle(async (req, res) => { SuccessResponseHandler(res, readingDto(await this.service.listFavorites(req.query, res.locals.user))); });
	setRating = this.handle(async (req, res) => { SuccessResponseHandler(res, await this.service.setRating(req.params.workId as string, req.body, res.locals.user)); });
	removeRating = this.handle(async (req, res) => { await this.service.removeRating(req.params.workId as string, res.locals.user); NoContentResponseHandler(res); });
	getProgress = this.handle(async (req, res) => { SuccessResponseHandler(res, readingDto(await this.service.getProgress(req.params.workId as string, req.query, res.locals.user))); });
	listHistory = this.handle(async (req, res) => { SuccessResponseHandler(res, readingDto(await this.service.listHistory(req.query, res.locals.user))); });
	getCalendar = this.handle(async (req, res) => { SuccessResponseHandler(res, await this.service.getCalendar(req.query, res.locals.user)); });
	getStats = this.handle(async (_req, res) => { SuccessResponseHandler(res, await this.service.getStats(res.locals.user)); });
	getWorkStats = this.handle(async (req, res) => { SuccessResponseHandler(res, await this.service.getWorkStats(req.params.workId as string)); });
}
