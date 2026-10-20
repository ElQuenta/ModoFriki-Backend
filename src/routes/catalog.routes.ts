import { Router } from "express";
import type Joi from "joi";
import { CatalogController } from "../controllers/catalog/catalog.controller";
import { createAuthenticate, createOptionalAuthenticate } from "../middlewares/auth.middleware";
import { authService, type AuthService } from "../services/auth/auth.service";
import { authorize } from "../middlewares/role.middleware";
import { catalogBody, catalogParams, catalogPreflight, catalogUploadError } from "../middlewares/catalog.middleware";
import { receiveChapterMedia, receiveWorkMedia, uploadMedia, validateImages, deleteReplacedChapterMedia } from "../middlewares/media";
import * as schema from "../middlewares/schemas/catalog.schema";
import { mediaRepository } from "../repositories/catalog/media.repository";
import { catalogService, type CatalogService, type Mutation } from "../services/catalog/catalog.service";

export function createCatalogRouter(service: CatalogService = catalogService, auth: Pick<AuthService, "authenticateToken"> = authService): Router {
	const router = Router();
	const authenticate = createAuthenticate(auth);
	const optionalAuthenticate = createOptionalAuthenticate(auth);
	const controller = new CatalogController(service);
	const respond = [deleteReplacedChapterMedia(mediaRepository), controller.respondSaved];
	const pipeline = (mode: Mutation, body: Joi.Schema) => [
		authenticate, catalogPreflight(service, mode === "createWork"),
		mode === "createWork" || mode === "editWork" ? receiveWorkMedia() : receiveChapterMedia(),
		catalogBody(body), validateImages(), uploadMedia({ repository: mediaRepository, plan: async (req, res, files) => {
			const result = await service.prepare(mode, req.body, files, res.locals.user!, req.params.workId as string | undefined, req.params.chapterId as string | undefined);
			res.locals.catalogPrepared = result.prepared;
			return result.plan;
		} }), catalogUploadError(service)
	];
	router.route("/works")
		.get(optionalAuthenticate, controller.listWorks)
		.post(...pipeline("createWork", schema.createWorkSchema), controller.save(true), ...respond);
	router.route("/works/:workId").all(catalogParams)
		.get(optionalAuthenticate, controller.getWork)
		.put(...pipeline("editWork", schema.editWorkSchema), controller.save(), ...respond)
		.patch(...pipeline("editWork", schema.editWorkSchema), controller.save(), ...respond)
		.delete(authenticate, catalogPreflight(service), catalogBody(schema.deleteWorkSchema), controller.removeWork);
	router.route("/works/:workId/chapters").all(catalogParams)
		.get(optionalAuthenticate, controller.listChapters)
		.post(...pipeline("createChapter", schema.createChapterSchema), controller.save(true), ...respond);
	router.route("/works/:workId/chapters/:chapterId").all(catalogParams)
		.get(optionalAuthenticate, controller.getChapter)
		.put(...pipeline("editChapter", schema.editChapterSchema), controller.save(), ...respond)
		.patch(...pipeline("editChapter", schema.editChapterSchema), controller.save(), ...respond)
		.delete(authenticate, catalogPreflight(service), catalogBody(schema.deleteChapterSchema), controller.removeChapter);
	router.route("/works/:workId/chapters/:chapterId/pages").all(catalogParams)
		.put(...pipeline("replace", schema.deleteChapterSchema), controller.save(), ...respond)
		.post(...pipeline("insert", schema.insertPagesSchema), controller.save(), ...respond)
		.patch(...pipeline("reorder", schema.reorderPagesSchema), controller.save(), ...respond);
	for (const [path, kind] of [["/work-types", "types"], ["/genres", "genres"]] as const) router.route(path)
		.get(controller.listTaxonomy(kind)).post(authenticate, authorize(["ADMIN"]), catalogBody(schema.taxonomySchema), controller.createTaxonomy(kind));
	return router;
}

export default createCatalogRouter();
