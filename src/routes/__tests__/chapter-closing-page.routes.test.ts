import express, { type ErrorRequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { startHttpServer } from "../../__tests__/helpers/http";
import { createCatalogRouter } from "../catalog.routes";

const workId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";
const finalPage = { id: "33333333-3333-4333-8333-333333333333", position: 2, asset: { id: "44444444-4444-4444-8444-444444444444", url: "https://blob/final.png", contentType: "image/png" } };

describe("chapter closing page contract", () => {
	let server: Awaited<ReturnType<typeof startHttpServer>>;
	let service: any;
	beforeEach(async () => {
		service = {
			getChapter: vi.fn().mockResolvedValue({ id: chapterId, workId, pages: [{ id: "page-1", position: 1, asset: { id: "asset-1", url: "https://blob/one.png", contentType: "image/png" } }, finalPage], readingImages: [{ kind: "WORK_OPENING", asset: { id: "opening", url: "https://blob/opening.png", contentType: "image/png" }, pageId: null, position: null }, { kind: "PAGE", asset: { id: "asset-1", url: "https://blob/one.png", contentType: "image/png" }, pageId: "page-1", position: 1 }, { kind: "PAGE", asset: finalPage.asset, pageId: finalPage.id, position: 2 }] }),
			getWork: vi.fn(), listWorks: vi.fn(), listChapters: vi.fn(), preflight: vi.fn(), prepare: vi.fn(), save: vi.fn(), abort: vi.fn(), removeWork: vi.fn(), removeChapter: vi.fn(), listTaxonomy: vi.fn(), createTaxonomy: vi.fn()
		};
		const app = express(); app.use(express.json()); app.use("/api", createCatalogRouter(service, { authenticateToken: vi.fn() }));
		const errors: ErrorRequestHandler = (error, _req, res, _next) => ErrorResponseHandler(res, error); app.use(errors);
		server = await startHttpServer(app);
	});
	afterEach(async () => server?.close());

	it("returns the editor-selected last page once and keeps it as an ordinary PAGE", async () => {
		const response = await server.request(`/api/works/${workId}/chapters/${chapterId}`);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data.pages).toHaveLength(2);
		expect(body.data.pages[1].id).toBe(finalPage.id);
		expect(body.data.readingImages.filter((image: { pageId: string | null }) => image.pageId === finalPage.id)).toHaveLength(1);
		expect(body.data.readingImages).toHaveLength(3);
	});

	it("allows a chapter without a closing page and preserves an optional opening outside page positions", async () => {
		service.getChapter.mockResolvedValueOnce({ id: chapterId, workId, pages: [], readingImages: [{ kind: "WORK_OPENING", asset: { id: "opening", url: "https://blob/opening.png", contentType: "image/png" }, pageId: null, position: null }] });
		const response = await server.request(`/api/works/${workId}/chapters/${chapterId}`);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ data: { pages: [], readingImages: [{ kind: "WORK_OPENING", pageId: null, position: null }] } });
	});
});
