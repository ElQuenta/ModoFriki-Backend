import type { ErrorRequestHandler, RequestHandler } from "express";
import type Joi from "joi";
import { catalogService, type CatalogService } from "../services/catalog/catalog.service";
import { catalogUuid, validateCatalog } from "./schemas/catalog.schema";
import { catchAndLogError, createLogger } from "../utils/logger";
import AppError from "../utils/AppError";

const logger = createLogger("CatalogMiddleware");
export const catalogParams: RequestHandler = (req, _res, next) => {
	try { for (const key of ["workId", "chapterId"]) if (req.params[key] !== undefined) req.params[key] = validateCatalog<string>(catalogUuid.required(), req.params[key]); next(); }
	catch (error) { return catchAndLogError(logger, error, "Unable to validate catalog parameters"); }
};
export const catalogBody = (schema: Joi.Schema): RequestHandler => (req, _res, next) => {
	try {
		const body = { ...(req.body ?? {}) };
		// Multipart arrays are JSON strings; repeated scalar fields remain invalid.
		if (req.is("multipart/form-data")) for (const key of ["alternativeTitles", "genreIds", "pageIds"]) if (typeof body[key] === "string") {
			try { body[key] = JSON.parse(body[key]); } catch { throw new AppError("Invalid multipart array", 400); }
		}
		req.body = validateCatalog(schema, body); next();
	} catch (error) { return catchAndLogError(logger, error, "Unable to validate catalog body"); }
};
export const catalogPreflight = (service: CatalogService = catalogService, creatingWork = false): RequestHandler => async (req, res, next) => {
	try { if (!res.locals.user) throw new AppError("Authentication required", 401); await service.preflight(req.params.workId as string | undefined, req.params.chapterId as string | undefined, res.locals.user, creatingWork); next(); }
	catch (error) { return catchAndLogError(logger, error, "Unable to authorize catalog mutation"); }
};
export const catalogUploadError = (service: CatalogService = catalogService): ErrorRequestHandler => async (error, _req, res, next) => {
	try { await service.abort(res.locals.uploadContext); } catch { logger.error("Unable to compensate failed catalog upload"); }
	next(error);
};
