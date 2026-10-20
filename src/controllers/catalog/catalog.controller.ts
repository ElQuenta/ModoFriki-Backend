import type { RequestHandler } from "express";
import { CreatedResponseHandler, NoContentResponseHandler, SuccessResponseHandler } from "../../handlers/success.handler";
import { catalogService, type CatalogService } from "../../services/catalog/catalog.service";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("CatalogController");
// Prisma Decimal serializes itself to string; BigInt metadata must also be JSON safe.
export const catalogDto = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));

export class CatalogController {
	constructor(private readonly service: CatalogService = catalogService) {}
	private handle(action: RequestHandler): RequestHandler { return async (req, res, next) => { try { logger.debug("Handling catalog request"); await action(req, res, next); } catch (error) { return catchAndLogError(logger, error, "Unable to handle catalog request"); } }; }
	listWorks = this.handle(async (req, res) => { SuccessResponseHandler(res, catalogDto(await this.service.listWorks(req.query, res.locals.user))); });
	getWork = this.handle(async (req, res) => { SuccessResponseHandler(res, catalogDto(await this.service.getWork(req.params.workId as string, res.locals.user))); });
	listChapters = this.handle(async (req, res) => { SuccessResponseHandler(res, catalogDto(await this.service.listChapters(req.params.workId as string, req.query, res.locals.user))); });
	getChapter = this.handle(async (req, res) => { SuccessResponseHandler(res, catalogDto(await this.service.getChapter(req.params.workId as string, req.params.chapterId as string, res.locals.user))); });
	save = (creating = false): RequestHandler => this.handle(async (_req, res) => {
		if (!res.locals.user || !res.locals.catalogPrepared) throw new AppError("Missing catalog upload context", 500);
		let record: unknown;
		try { record = await this.service.save(res.locals.catalogPrepared, res.locals.uploadedMedia ?? [], res.locals.user); }
		catch (error) { try { await this.service.abort(res.locals.uploadContext); } catch { logger.error("Unable to compensate failed catalog save"); } throw error; }
		if (creating) CreatedResponseHandler(res, catalogDto(record)); else SuccessResponseHandler(res, catalogDto(record));
	});
	removeWork = this.handle(async (req, res) => { await this.service.removeWork(req.params.workId as string, req.body, res.locals.user!); NoContentResponseHandler(res); });
	removeChapter = this.handle(async (req, res) => { await this.service.removeChapter(req.params.workId as string, req.params.chapterId as string, req.body, res.locals.user!); NoContentResponseHandler(res); });
	listTaxonomy = (kind: "types" | "genres"): RequestHandler => this.handle(async (_req, res) => { SuccessResponseHandler(res, await this.service.listTaxonomy(kind)); });
	createTaxonomy = (kind: "types" | "genres"): RequestHandler => this.handle(async (req, res) => { CreatedResponseHandler(res, await this.service.createTaxonomy(kind, req.body, res.locals.user!)); });
}
