import { randomUUID } from "node:crypto";
import { workRepository } from "../../repositories/catalog/work.repository";
import { chapterRepository } from "../../repositories/catalog/chapter.repository";
import { taxonomyRepository } from "../../repositories/catalog/taxonomy.repository";
import { mediaRepository } from "../../repositories/catalog/media.repository";
import type { AssetInput, CatalogActor, ChapterInput, ChapterPatch, ChapterRecord, UploadContext, WorkInput, WorkPatch, WorkRecord, WorkRepositoryContract, ChapterRepositoryContract, TaxonomyRepositoryContract, MediaRepositoryContract } from "../../types/catalog.types";
import * as schemas from "../../middlewares/schemas/catalog.schema";
import { chapterMediaPath, createWorkSlug, shortId, workMediaPath } from "../../utils/media-paths";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("CatalogService");
export type Mutation = "createWork" | "editWork" | "createChapter" | "editChapter" | "replace" | "insert" | "reorder";
interface Image { fieldName: string; contentType: string; size: number; extension: string }
interface PlanObject { pathname: string; contentType: string; size: number; fieldName?: string; position?: number; fileIndex?: number; sourcePathname?: string }
export interface CatalogPlan { context: UploadContext; objects: PlanObject[] }
export interface CatalogPrepared { context: UploadContext; data: WorkPatch | ChapterPatch; pagesRequired: boolean }
type WorkBody = WorkPatch & { expectedUpdatedAt: Date };
type ChapterBody = ChapterPatch & { expectedVersion: number; position?: number; pageIds?: string[] };

export class CatalogService {
	constructor(private readonly works: WorkRepositoryContract = workRepository, private readonly chapters: ChapterRepositoryContract = chapterRepository,
		private readonly taxonomy: TaxonomyRepositoryContract = taxonomyRepository, private readonly media: MediaRepositoryContract = mediaRepository) {}
	private async run<T>(operation: () => Promise<T>): Promise<T> {
		try { logger.debug("Processing catalog operation"); return await operation(); }
		catch (error) { return catchAndLogError(logger, error, "Unable to process catalog operation"); }
	}
	private staff(actor?: CatalogActor): CatalogActor {
		if (!actor) throw new AppError("Authentication required", 401);
		if (actor.role !== "ADMIN" && actor.role !== "EDITOR") throw new AppError("Insufficient permissions", 403);
		return actor;
	}
	private admin(actor: CatalogActor): void { if (this.staff(actor).role !== "ADMIN") throw new AppError("Insufficient permissions", 403); }
	listWorks(input: unknown, actor?: CatalogActor) { return this.run(async () => this.works.list(this.listInput(input, actor), actor)); }
	private listInput(input: unknown, actor?: CatalogActor) {
		const query = schemas.validateCatalog<{ page: number; limit: number; search?: string; typeId?: string; genreId?: string; includeDrafts: boolean }>(schemas.catalogListSchema, input);
		if (query.includeDrafts) this.staff(actor);
		return { skip: (query.page - 1) * query.limit, take: query.limit, search: query.search, typeId: query.typeId, genreId: query.genreId, includeDrafts: query.includeDrafts };
	}
	getWork(id: string, actor?: CatalogActor) { return this.run(async () => { const record = await this.works.findById(id, actor); if (!record) throw new AppError("Work not found", 404); return record; }); }
	listChapters(workId: string, input: unknown, actor?: CatalogActor) { return this.run(async () => { await this.getWork(workId, actor); return this.chapters.list(workId, this.listInput(input, actor), actor); }); }
	getChapter(workId: string, id: string, actor?: CatalogActor) { return this.run(async () => { const record = await this.chapters.findById(workId, id, actor); if (!record) throw new AppError("Chapter not found", 404); return record; }); }
	preflight(workId: string | undefined, chapterId: string | undefined, actor: CatalogActor, creatingWork = false) {
		return this.run(async () => {
			this.staff(actor); if (creatingWork) { this.admin(actor); return; }
			await this.works.findForEdit(workId!, actor);
			if (chapterId) await this.chapters.findForEdit(workId!, chapterId, actor);
		});
	}
	private async references(data: WorkPatch): Promise<void> {
		if (data.typeId && !(await this.taxonomy.listTypes()).some(t => t.id === data.typeId)) throw new AppError("Unknown work type", 400);
		if (data.genreIds) { const ids = new Set((await this.taxonomy.listGenres()).map(g => g.id)); if (data.genreIds.some(id => !ids.has(id))) throw new AppError("Unknown genre", 400); }
	}
	prepare(mode: Mutation, raw: unknown, images: Image[], actor: CatalogActor, workId?: string, chapterId?: string): Promise<{ plan: CatalogPlan; prepared: CatalogPrepared }> {
		return this.run(async () => {
			await this.preflight(workId, chapterId, actor, mode === "createWork");
			const workMode = mode === "createWork" || mode === "editWork";
			if (images.length > (workMode ? 2 : 100) || images.some(image => !Number.isSafeInteger(image.size) || image.size < 1 || image.size > 10 * 1024 * 1024
				|| !["image/jpeg", "image/png", "image/webp"].includes(image.contentType) || !["jpg", "png", "webp"].includes(image.extension)
				|| !(workMode ? ["cover", "inpagecover"] : ["pages"]).includes(image.fieldName))) throw new AppError("Invalid image metadata", 400);
			if (workMode && new Set(images.map(image => image.fieldName)).size !== images.length) throw new AppError("Only one image per work media field is allowed", 400);
			if (mode === "reorder" && images.length) throw new AppError("Reordering accepts JSON pageIds only", 400);
			const schema = mode === "createWork" ? schemas.createWorkSchema : mode === "editWork" ? schemas.editWorkSchema : mode === "createChapter" ? schemas.createChapterSchema : mode === "insert" ? schemas.insertPagesSchema : mode === "reorder" ? schemas.reorderPagesSchema : mode === "replace" ? schemas.deleteChapterSchema : schemas.editChapterSchema;
			const body = schemas.validateCatalog<WorkBody & ChapterBody>(schema, raw);
			const { expectedUpdatedAt, expectedVersion, position, pageIds, ...data } = body;
			const objects: PlanObject[] = [];
			let context: UploadContext;
			if (workMode) {
				await this.references(data);
				let work: WorkRecord;
				if (mode === "createWork") {
					if (data.publicationStatus === "PUBLISHED" && !images.some(i => i.fieldName === "cover")) throw new AppError("Published work requires a cover", 400);
					const id = randomUUID(); work = await this.works.reserve(id, createWorkSlug(data.title!, id), data as WorkInput, actor);
				} else {
					work = await this.works.findForEdit(workId!, actor);
					if (work.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new AppError("Work changed; reload before editing", 409);
					if ((data.publicationStatus ?? work.publicationStatus) === "PUBLISHED" && !work.coverAssetId && !images.some(i => i.fieldName === "cover")) throw new AppError("Published work requires a cover", 400);
				}
				context = { workId: work.id, workSlug: work.slug, actorId: actor.id, expectedUpdatedAt: work.updatedAt, creating: mode === "createWork" };
				images.forEach((file, fileIndex) => objects.push({ pathname: workMediaPath(work.slug, file.fieldName as "cover" | "inpagecover", shortId(), file.extension), contentType: file.contentType, size: file.size, fieldName: file.fieldName, fileIndex }));
			} else {
				const work = await this.works.findForEdit(workId!, actor);
				let chapter: ChapterRecord;
				if ((mode === "replace" || mode === "insert") && images.length === 0) throw new AppError("At least one page is required", 400);
				if (mode === "createChapter") {
					if (data.status === "PUBLISHED" && (images.length === 0 || work.publicationStatus !== "PUBLISHED")) throw new AppError("Published chapter requires pages and a published work", 400);
					chapter = await this.chapters.reserve(randomUUID(), work.id, data as ChapterInput, actor);
				} else {
					chapter = await this.chapters.findForEdit(work.id, chapterId!, actor);
					if (chapter.version !== expectedVersion) throw new AppError("Chapter changed; reload before editing", 409);
					if ((data.status ?? chapter.status) === "PUBLISHED" && (work.publicationStatus !== "PUBLISHED" || (images.length === 0 && chapter.pages.length === 0))) throw new AppError("Published chapter requires pages and a published work", 400);
				}
				context = { workId: work.id, chapterId: chapter.id, workSlug: work.slug, actorId: actor.id, expectedVersion: chapter.version, creating: mode === "createChapter" };
				const originals = [...chapter.pages].sort((a, b) => a.position - b.position);
				type Source = { fileIndex: number } | { page: ChapterRecord["pages"][number] };
				let sources: Source[] = images.map((_file, fileIndex) => ({ fileIndex }));
				if (mode === "insert") {
					if (!position || position > originals.length + 1) throw new AppError("Invalid insertion position", 400);
					sources = [...originals.slice(0, position - 1).map(page => ({ page })), ...sources, ...originals.slice(position - 1).map(page => ({ page }))];
				} else if (mode === "reorder") {
					if (!pageIds || pageIds.length !== originals.length || pageIds.some(id => !originals.some(p => p.id === id))) throw new AppError("pageIds must be an exact permutation of chapter pages", 400);
					sources = pageIds.map(id => ({ page: originals.find(p => p.id === id)! }));
				}
				if (sources.length > 1000) throw new AppError("Chapter exceeds 1000 pages", 400);
				const generation = shortId();
				sources.forEach((source, index) => {
					const file = "fileIndex" in source ? images[source.fileIndex] : undefined;
					const asset = "page" in source ? source.page.asset : undefined;
					const contentType = file?.contentType ?? asset!.contentType;
					const extension = file?.extension ?? ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType]);
					if (!extension) throw new AppError("Unsupported existing image", 415);
					objects.push({ pathname: chapterMediaPath(work.slug, chapter.id, generation, index + 1, extension), contentType, size: file?.size ?? Number(asset!.sizeBytes), position: index + 1, ...("fileIndex" in source ? { fileIndex: source.fileIndex } : { sourcePathname: asset!.pathname }) });
				});
			}
			return { plan: { context, objects }, prepared: { context, data, pagesRequired: !workMode && (images.length > 0 || mode === "reorder") } };
		});
	}
	save(prepared: CatalogPrepared, assets: AssetInput[], actor: CatalogActor) {
		return this.run(async () => {
			const c = prepared.context;
			if (c.chapterId) return this.chapters.save({ actor, workId: c.workId, chapterId: c.chapterId, data: prepared.data as ChapterPatch, expectedVersion: c.expectedVersion!, creating: c.creating, batchId: c.batchId, pages: prepared.pagesRequired ? assets : undefined });
			return this.works.save({ actor, workId: c.workId, data: prepared.data as WorkPatch, expectedUpdatedAt: c.expectedUpdatedAt!, creating: c.creating, batchId: c.batchId, assets: assets.length ? assets : undefined });
		});
	}
	abort(context?: UploadContext) { return this.run(async () => { if (!context) return; if (context.batchId) await this.media.abandonBatch(context.batchId); if (context.creating) { if (context.chapterId) await this.chapters.abortReservation(context.chapterId, context.actorId); else await this.works.abortReservation(context.workId, context.actorId); } }); }
	removeWork(id: string, input: unknown, actor: CatalogActor) { return this.run(async () => { const body = schemas.validateCatalog<{ expectedUpdatedAt: Date }>(schemas.deleteWorkSchema, input); await this.preflight(id, undefined, actor); await this.works.remove(id, actor, body.expectedUpdatedAt); }); }
	removeChapter(workId: string, id: string, input: unknown, actor: CatalogActor) { return this.run(async () => { const body = schemas.validateCatalog<{ expectedVersion: number }>(schemas.deleteChapterSchema, input); await this.preflight(workId, id, actor); await this.chapters.remove(workId, id, actor, body.expectedVersion); }); }
	listTaxonomy(kind: "types" | "genres") { return this.run(() => kind === "types" ? this.taxonomy.listTypes() : this.taxonomy.listGenres()); }
	createTaxonomy(kind: "types" | "genres", input: unknown, actor: CatalogActor) { return this.run(async () => { this.admin(actor); const body = schemas.validateCatalog<{ name: string; slug: string }>(schemas.taxonomySchema, input); return kind === "types" ? this.taxonomy.createType(body.name, body.slug, actor) : this.taxonomy.createGenre(body.name, body.slug, actor); }); }
}

export const catalogService = new CatalogService();
