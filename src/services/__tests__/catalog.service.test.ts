import { beforeEach, describe, expect, it, vi } from "vitest";

// Los repositorios por defecto importan Prisma: se reemplazan para que nunca se abra una conexión.
vi.mock("../../repositories/catalog/work.repository", () => ({ workRepository: {} }));
vi.mock("../../repositories/catalog/chapter.repository", () => ({ chapterRepository: {} }));
vi.mock("../../repositories/catalog/taxonomy.repository", () => ({ taxonomyRepository: {} }));
vi.mock("../../repositories/catalog/media.repository", () => ({ mediaRepository: {} }));

import { CatalogService } from "../catalog/catalog.service";
import AppError from "../../utils/AppError";
import type { CatalogActor } from "../../types/catalog.types";

const workId = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const chapterId = "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e";
const typeId = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";
const genreId = "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a";
const pageA = "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b";
const pageB = "f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c";
const updatedAt = new Date("2026-10-01T00:00:00.000Z");

const admin: CatalogActor = { id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", role: "ADMIN" };
const editor: CatalogActor = { id: "a2b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", role: "EDITOR" };
const basic: CatalogActor = { id: "a3b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", role: "BASIC" };

const cover = { fieldName: "cover", contentType: "image/png", size: 100, extension: "png" };
const banner = { fieldName: "banner", contentType: "image/png", size: 100, extension: "png" };
const inpagecover = { fieldName: "inpagecover", contentType: "image/png", size: 100, extension: "png" };
const pageImg = { fieldName: "pages", contentType: "image/jpeg", size: 100, extension: "jpg" };

const makeWork = (over: Record<string, unknown> = {}) => ({ id: workId, slug: "mi-obra-3f2b", updatedAt, publicationStatus: "DRAFT", coverAssetId: null, bannerAssetId: null, incapBannerAssetId: null, legacyPublicationImagesExempt: false, ...over });
const makePage = (id: string, position: number) => ({ id, position, assetId: `asset-${position}`, asset: { contentType: "image/png", sizeBytes: BigInt(50), pathname: `mi-obra-3f2b/Chapter-b1c2/aaaa-${position}.png` } });
const makeChapter = (over: Record<string, unknown> = {}) => ({ id: chapterId, version: 3, status: "DRAFT", pages: [] as ReturnType<typeof makePage>[], ...over });

const makeRepos = () => ({
	works: { list: vi.fn(async () => []), findById: vi.fn(async (): Promise<unknown> => makeWork()), findForEdit: vi.fn(async (): Promise<unknown> => makeWork()), reserve: vi.fn(async (): Promise<unknown> => makeWork()), save: vi.fn(async () => makeWork()), remove: vi.fn(async () => undefined), abortReservation: vi.fn(async () => undefined) },
	chapters: { list: vi.fn(async () => []), findById: vi.fn(async (): Promise<unknown> => makeChapter()), findForEdit: vi.fn(async (): Promise<unknown> => makeChapter()), reserve: vi.fn(async (): Promise<unknown> => makeChapter()), save: vi.fn(async () => makeChapter()), remove: vi.fn(async () => undefined), abortReservation: vi.fn(async () => undefined) },
	taxonomy: { listTypes: vi.fn(async () => [{ id: typeId }]), listGenres: vi.fn(async () => [{ id: genreId }]), createType: vi.fn(async () => ({ id: typeId })), createGenre: vi.fn(async () => ({ id: genreId })) },
	media: { abandonBatch: vi.fn(async () => undefined) }
});

const expectStatus = async (promise: Promise<unknown>, status: number, message?: string) => {
	const error = await promise.catch((e: unknown) => e);
	expect(error).toBeInstanceOf(AppError);
	expect((error as AppError).statusCode).toBe(status);
	if (message) expect((error as AppError).message).toBe(message);
};

let repos: ReturnType<typeof makeRepos>;
let service: CatalogService;
beforeEach(() => {
	repos = makeRepos();
	service = new CatalogService(repos.works as never, repos.chapters as never, repos.taxonomy as never, repos.media as never);
});

const newWork = { title: "Mi Obra", synopsis: "Sinopsis", typeId };

describe("lecturas públicas", () => {
	it("listWorks sin sesión pide solo publicados (includeDrafts false) y pagina", async () => {
		await service.listWorks({ page: "2", limit: "10" });
		expect(repos.works.list).toHaveBeenCalledWith({ skip: 10, take: 10, search: undefined, typeId: undefined, genreId: undefined, includeDrafts: false }, undefined);
	});
	it("includeDrafts sin sesión → 401", async () => {
		await expectStatus(service.listWorks({ includeDrafts: "true" }), 401);
		expect(repos.works.list).not.toHaveBeenCalled();
	});
	it("includeDrafts con BASIC → 403", async () => {
		await expectStatus(service.listWorks({ includeDrafts: "true" }, basic), 403);
	});
	it("includeDrafts con EDITOR o ADMIN se delega al repositorio", async () => {
		await service.listWorks({ includeDrafts: true }, editor);
		await service.listWorks({ includeDrafts: true }, admin);
		expect(repos.works.list).toHaveBeenCalledTimes(2);
		expect(repos.works.list.mock.calls[0][0]).toMatchObject({ includeDrafts: true });
	});
	it("query inválida → 400", async () => {
		await expectStatus(service.listWorks({ limit: 101 }), 400);
		await expectStatus(service.listWorks({ foo: "x" }), 400);
	});
	it("getWork inexistente u oculto → 404", async () => {
		repos.works.findById.mockResolvedValueOnce(null);
		await expectStatus(service.getWork(workId), 404, "Work not found");
	});
	it("getChapter inexistente u oculto → 404", async () => {
		repos.chapters.findById.mockResolvedValueOnce(null);
		await expectStatus(service.getChapter(workId, chapterId), 404, "Chapter not found");
	});
	it("getChapter conserva pages y antepone una sola apertura vigente", async () => {
		const page = makePage(pageA, 1);
		repos.chapters.findById.mockResolvedValueOnce(makeChapter({ pages: [page], work: { incapBannerAsset: { id: "opening", url: "https://blob/opening.png", contentType: "image/png" } } }));
		const chapter = await service.getChapter(workId, chapterId);
		expect(chapter.pages).toEqual([page]);
		expect(chapter.readingImages).toEqual([
			{ kind: "WORK_OPENING", asset: { id: "opening", url: "https://blob/opening.png", contentType: "image/png" }, pageId: null, position: null },
			{ kind: "PAGE", asset: { id: page.asset.id, url: page.asset.url, contentType: page.asset.contentType }, pageId: page.id, position: 1 }
		]);
	});
	it("listChapters de obra oculta → 404 sin listar", async () => {
		repos.works.findById.mockResolvedValueOnce(null);
		await expectStatus(service.listChapters(workId, {}), 404);
		expect(repos.chapters.list).not.toHaveBeenCalled();
	});
	it("listChapters con includeDrafts sin sesión → 401", async () => {
		await expectStatus(service.listChapters(workId, { includeDrafts: true }), 401);
	});
	it("error inesperado del repositorio → 500 genérico", async () => {
		repos.works.findById.mockRejectedValueOnce(new Error("connection string secret"));
		await expectStatus(service.getWork(workId), 500, "Unable to process catalog operation");
	});
});

describe("permisos de creación/edición", () => {
	it("createWork: BASIC y EDITOR → 403; ADMIN reserva", async () => {
		await expectStatus(service.prepare("createWork", newWork, [], basic), 403);
		await expectStatus(service.prepare("createWork", newWork, [], editor), 403);
		expect(repos.works.reserve).not.toHaveBeenCalled();
		const { plan } = await service.prepare("createWork", newWork, [], admin);
		expect(repos.works.reserve).toHaveBeenCalledOnce();
		expect(plan.context).toMatchObject({ workId, creating: true, actorId: admin.id });
	});
	it("editWork: BASIC → 403 sin tocar el repositorio", async () => {
		await expectStatus(service.prepare("editWork", { title: "x", expectedUpdatedAt: updatedAt.toISOString() }, [], basic, workId), 403);
		expect(repos.works.findForEdit).not.toHaveBeenCalled();
	});
	it("editWork: EDITOR sin asignación (IDOR) → 403 propagado del repositorio", async () => {
		repos.works.findForEdit.mockRejectedValue(new AppError("Work is not assigned to this editor", 403));
		await expectStatus(service.prepare("editWork", { title: "x", expectedUpdatedAt: updatedAt.toISOString() }, [], editor, workId), 403);
	});
	it("createChapter: EDITOR asignado a otra obra (IDOR) → 403", async () => {
		repos.works.findForEdit.mockRejectedValue(new AppError("Work is not assigned to this editor", 403));
		await expectStatus(service.prepare("createChapter", { number: "1" }, [], editor, workId), 403);
		expect(repos.chapters.reserve).not.toHaveBeenCalled();
	});
	it("createChapter: BASIC → 403; ADMIN permitido", async () => {
		await expectStatus(service.prepare("createChapter", { number: "1" }, [], basic, workId), 403);
		const { plan } = await service.prepare("createChapter", { number: "1" }, [], admin, workId);
		expect(plan.context).toMatchObject({ workId, chapterId, creating: true });
	});
	it("editChapter: obra inexistente → 404", async () => {
		repos.works.findForEdit.mockRejectedValue(new AppError("Work not found", 404));
		await expectStatus(service.prepare("editChapter", { title: "x", expectedVersion: 3 }, [], admin, workId, chapterId), 404);
	});
	it("editChapter: capítulo inexistente → 404", async () => {
		repos.chapters.findForEdit.mockRejectedValue(new AppError("Chapter not found", 404));
		await expectStatus(service.prepare("editChapter", { title: "x", expectedVersion: 3 }, [], admin, workId, chapterId), 404);
	});
	it("sin actor → 401", async () => {
		await expectStatus(service.preflight(workId, undefined, undefined as never), 401);
	});
	it("removeWork / removeChapter: BASIC → 403; EDITOR IDOR → 403; ADMIN borra", async () => {
		await expectStatus(service.removeWork(workId, { expectedUpdatedAt: updatedAt.toISOString() }, basic), 403);
		await expectStatus(service.removeChapter(workId, chapterId, { expectedVersion: 3 }, basic), 403);
		repos.works.findForEdit.mockRejectedValueOnce(new AppError("Work is not assigned to this editor", 403));
		await expectStatus(service.removeWork(workId, { expectedUpdatedAt: updatedAt.toISOString() }, editor), 403);
		expect(repos.works.remove).not.toHaveBeenCalled();
		await service.removeChapter(workId, chapterId, { expectedVersion: 3 }, admin);
		expect(repos.chapters.remove).toHaveBeenCalledWith(workId, chapterId, admin, 3);
	});
	it("createTaxonomy: EDITOR → 403; ADMIN crea", async () => {
		await expectStatus(service.createTaxonomy("genres", { name: "Acción", slug: "accion" }, editor), 403);
		await service.createTaxonomy("genres", { name: "Acción", slug: "accion" }, admin);
		expect(repos.taxonomy.createGenre).toHaveBeenCalledWith("Acción", "accion", admin);
	});
});

describe("conflictos 409", () => {
	it("editWork con expectedUpdatedAt viejo → 409", async () => {
		await expectStatus(service.prepare("editWork", { title: "x", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }, [], admin, workId), 409);
	});
	it("editWork con expectedUpdatedAt vigente pasa", async () => {
		const { prepared } = await service.prepare("editWork", { title: "Nuevo", expectedUpdatedAt: updatedAt.toISOString() }, [], admin, workId);
		expect(prepared.data).toEqual({ title: "Nuevo" });
	});
	it("editChapter con expectedVersion distinto → 409", async () => {
		await expectStatus(service.prepare("editChapter", { title: "x", expectedVersion: 2 }, [], admin, workId, chapterId), 409);
	});
	it("createChapter con número repetido → 409 del repositorio", async () => {
		repos.chapters.reserve.mockRejectedValue(new AppError("Chapter number already exists", 409));
		await expectStatus(service.prepare("createChapter", { number: "1" }, [], admin, workId), 409);
	});
	it("createWork con slug/ruta en conflicto → 409 del repositorio", async () => {
		repos.works.reserve.mockRejectedValue(new AppError("Work folder collision; retry", 409));
		await expectStatus(service.prepare("createWork", newWork, [], admin), 409);
	});
});

describe("reglas de publicación", () => {
	it("crear obra PUBLISHED sin sus tres imágenes → 400 antes del Blob", async () => {
		await expectStatus(service.prepare("createWork", { ...newWork, publicationStatus: "PUBLISHED" }, [], admin), 400, "Published work requires cover, banner and in-page cover");
		expect(repos.works.reserve).not.toHaveBeenCalled();
	});
	it("crear obra PUBLISHED con tres imágenes planifica recursos aislados", async () => {
		const { plan } = await service.prepare("createWork", { ...newWork, publicationStatus: "PUBLISHED" }, [cover, banner, inpagecover], admin);
		expect(plan.objects).toHaveLength(3);
		expect(plan.objects.map(object => object.pathname)).toEqual(expect.arrayContaining([expect.stringMatching(/^mi-obra-3f2b\/Covers\/[a-f0-9]{4}\.png$/), expect.stringMatching(/^mi-obra-3f2b\/Banners\/[a-f0-9]{4}\.png$/), expect.stringMatching(/^mi-obra-3f2b\/CoverPage\/[a-f0-9]{4}\.png$/)]));
	});
	it("editar a PUBLISHED sin recursos previos ni nuevos → 400", async () => {
		await expectStatus(service.prepare("editWork", { publicationStatus: "PUBLISHED", expectedUpdatedAt: updatedAt.toISOString() }, [], admin, workId), 400, "Published work requires cover, banner and in-page cover");
	});
	it("editar a PUBLISHED con recursos existentes o exención histórica pasa", async () => {
		repos.works.findForEdit.mockResolvedValue(makeWork({ coverAssetId: "cover", bannerAssetId: "banner", incapBannerAssetId: "inpage" }));
		await expect(service.prepare("editWork", { publicationStatus: "PUBLISHED", expectedUpdatedAt: updatedAt.toISOString() }, [], admin, workId)).resolves.toBeDefined();
		repos.works.findForEdit.mockResolvedValue(makeWork({ coverAssetId: "cover", legacyPublicationImagesExempt: true }));
		await expect(service.prepare("editWork", { publicationStatus: "PUBLISHED", expectedUpdatedAt: updatedAt.toISOString() }, [], admin, workId)).resolves.toBeDefined();
	});
	it("crear capítulo PUBLISHED sin páginas → 400", async () => {
		repos.works.findForEdit.mockResolvedValue(makeWork({ publicationStatus: "PUBLISHED" }));
		await expectStatus(service.prepare("createChapter", { number: "1", status: "PUBLISHED" }, [], admin, workId), 400, "Published chapter requires pages and a published work");
	});
	it("crear capítulo PUBLISHED en obra borrador → 400", async () => {
		await expectStatus(service.prepare("createChapter", { number: "1", status: "PUBLISHED" }, [pageImg], admin, workId), 400);
	});
	it("editar capítulo a PUBLISHED sin páginas → 400", async () => {
		repos.works.findForEdit.mockResolvedValue(makeWork({ publicationStatus: "PUBLISHED" }));
		await expectStatus(service.prepare("editChapter", { status: "PUBLISHED", expectedVersion: 3 }, [], admin, workId, chapterId), 400);
	});
	it("editar capítulo a PUBLISHED con páginas existentes pasa", async () => {
		repos.works.findForEdit.mockResolvedValue(makeWork({ publicationStatus: "PUBLISHED" }));
		repos.chapters.findForEdit.mockResolvedValue(makeChapter({ pages: [makePage(pageA, 1)] }));
		await expect(service.prepare("editChapter", { status: "PUBLISHED", expectedVersion: 3 }, [], admin, workId, chapterId)).resolves.toBeDefined();
	});
});

describe("validación de entrada e imágenes", () => {
	it("typeId o genreIds desconocidos → 400", async () => {
		await expectStatus(service.prepare("createWork", { ...newWork, typeId: genreId }, [], admin), 400, "Unknown work type");
		await expectStatus(service.prepare("createWork", { ...newWork, genreIds: [typeId] }, [], admin), 400, "Unknown genre");
	});
	it("body con campos extra → 400", async () => {
		await expectStatus(service.prepare("createWork", { ...newWork, slug: "x" }, [], admin), 400, "Invalid catalog input");
	});
	it("MIME no permitido, tamaño > 10 MiB o campo equivocado → 400", async () => {
		await expectStatus(service.prepare("createWork", newWork, [{ ...cover, contentType: "image/gif" }], admin), 400, "Invalid image metadata");
		await expectStatus(service.prepare("createWork", newWork, [{ ...cover, size: 10 * 1024 * 1024 + 1 }], admin), 400, "Invalid image metadata");
		await expectStatus(service.prepare("createChapter", { number: "1" }, [cover], admin, workId), 400, "Invalid image metadata");
	});
	it("dos portadas en el mismo campo → 400", async () => {
		await expectStatus(service.prepare("createWork", newWork, [cover, cover], admin), 400);
	});
	it("replace/insert sin páginas → 400; reorder con archivos → 400", async () => {
		await expectStatus(service.prepare("replace", { expectedVersion: 3 }, [], admin, workId, chapterId), 400, "At least one page is required");
		await expectStatus(service.prepare("reorder", { expectedVersion: 3, pageIds: [pageA] }, [pageImg], admin, workId, chapterId), 400);
	});
	it("insert en posición fuera de rango → 400", async () => {
		repos.chapters.findForEdit.mockResolvedValue(makeChapter({ pages: [makePage(pageA, 1)] }));
		await expectStatus(service.prepare("insert", { expectedVersion: 3, position: 3 }, [pageImg], admin, workId, chapterId), 400, "Invalid insertion position");
	});
	it("insert en medio renumera y conserva páginas previas", async () => {
		repos.chapters.findForEdit.mockResolvedValue(makeChapter({ pages: [makePage(pageA, 1), makePage(pageB, 2)] }));
		const { plan, prepared } = await service.prepare("insert", { expectedVersion: 3, position: 2 }, [pageImg], admin, workId, chapterId);
		expect(plan.objects.map(o => [o.position, o.fileIndex, o.sourcePathname])).toEqual([[1, undefined, "mi-obra-3f2b/Chapter-b1c2/aaaa-1.png"], [2, 0, undefined], [3, undefined, "mi-obra-3f2b/Chapter-b1c2/aaaa-2.png"]]);
		expect(prepared.pagesRequired).toBe(true);
		expect(plan.context.replacedPageAssetIds).toEqual(["asset-1", "asset-2"]);
	});
	it("reorder que no es permutación exacta → 400; permutación válida invierte el orden", async () => {
		repos.chapters.findForEdit.mockResolvedValue(makeChapter({ pages: [makePage(pageA, 1), makePage(pageB, 2)] }));
		await expectStatus(service.prepare("reorder", { expectedVersion: 3, pageIds: [pageA] }, [], admin, workId, chapterId), 400);
		const { plan } = await service.prepare("reorder", { expectedVersion: 3, pageIds: [pageB, pageA] }, [], admin, workId, chapterId);
		expect(plan.objects.map(o => o.sourcePathname)).toEqual(["mi-obra-3f2b/Chapter-b1c2/aaaa-2.png", "mi-obra-3f2b/Chapter-b1c2/aaaa-1.png"]);
	});
});

describe("save y abort", () => {
	it("save de capítulo envía páginas solo si pagesRequired", async () => {
		const assets = [{ id: "x", url: "u", pathname: "p", contentType: "image/png", size: 1, position: 1 }];
		await service.save({ context: { workId, chapterId, workSlug: "s", actorId: admin.id, expectedVersion: 3 }, data: {}, pagesRequired: false }, assets, admin);
		expect(repos.chapters.save).toHaveBeenCalledWith(expect.objectContaining({ pages: undefined, expectedVersion: 3 }));
		await service.save({ context: { workId, workSlug: "s", actorId: admin.id, expectedUpdatedAt: updatedAt }, data: {}, pagesRequired: false }, [], admin);
		expect(repos.works.save).toHaveBeenCalledWith(expect.objectContaining({ assets: undefined, expectedUpdatedAt: updatedAt }));
	});
	it("abort abandona el lote y libera la reserva creada", async () => {
		await service.abort({ workId, chapterId, workSlug: "s", actorId: admin.id, batchId: "b1", creating: true });
		expect(repos.media.abandonBatch).toHaveBeenCalledWith("b1");
		expect(repos.chapters.abortReservation).toHaveBeenCalledWith(chapterId, admin.id);
		expect(repos.works.abortReservation).not.toHaveBeenCalled();
	});
});
