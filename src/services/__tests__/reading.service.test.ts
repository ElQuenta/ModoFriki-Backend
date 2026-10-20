import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/reading/reading.repository", () => ({ readingRepository: {} }));

import { ReadingService } from "../reading/reading.service";
import type { ReadingRepositoryContract } from "../../types/reading.types";
import AppError from "../../utils/AppError";

const workId = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const chapterId = "2c9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bee";
const key = "3d9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bef";
const actor = { id: "4e9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bf0", timezone: "America/La_Paz" };

const fakeRepository = () => ({
	recordVisit: vi.fn(), recordRead: vi.fn(), setReadState: vi.fn(), setFavorite: vi.fn(),
	listFavorites: vi.fn(), setRating: vi.fn(), getWorkState: vi.fn(), listHistory: vi.fn(),
	getCalendar: vi.fn(), getStats: vi.fn(), getWorkStats: vi.fn()
});

const expectStatus = async (promise: Promise<unknown>, status: number) => {
	const error = await promise.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(AppError);
	expect((error as AppError).statusCode).toBe(status);
};

describe("ReadingService", () => {
	let repository: ReturnType<typeof fakeRepository>;
	let service: ReadingService;

	beforeEach(() => {
		repository = fakeRepository();
		service = new ReadingService(repository as unknown as ReadingRepositoryContract);
	});

	describe("favoritos", () => {
		it("marca favorito con el usuario autenticado", async () => {
			repository.setFavorite.mockResolvedValue({ workId, isFavorite: true });
			await expect(service.setFavorite(workId, true, actor)).resolves.toEqual({ workId, isFavorite: true });
			expect(repository.setFavorite).toHaveBeenCalledWith(workId, true, actor);
		});

		it("normaliza el UUID a minúsculas antes del repositorio", async () => {
			repository.setFavorite.mockResolvedValue({ workId, isFavorite: false });
			await service.setFavorite(workId.toUpperCase(), false, actor);
			expect(repository.setFavorite).toHaveBeenCalledWith(workId, false, actor);
		});

		it("sin usuario autenticado → 401 y no toca el repositorio", async () => {
			await expectStatus(service.setFavorite(workId, true), 401);
			expect(repository.setFavorite).not.toHaveBeenCalled();
		});

		it("workId inválido → 400", async () => {
			await expectStatus(service.setFavorite("no-uuid", true, actor), 400);
			expect(repository.setFavorite).not.toHaveBeenCalled();
		});

		it("obra inexistente u oculta (404 del repositorio) se propaga como 404", async () => {
			repository.setFavorite.mockRejectedValue(new AppError("Work not found", 404));
			await expectStatus(service.setFavorite(workId, true, actor), 404);
		});

		it("lista favoritos paginados del usuario autenticado", async () => {
			repository.listFavorites.mockResolvedValue({ items: [], total: 7, skip: 5, take: 5 });
			await expect(service.listFavorites({ page: "2", limit: "5" }, actor)).resolves.toEqual({ items: [], total: 7, page: 2, limit: 5 });
			expect(repository.listFavorites).toHaveBeenCalledWith(actor, { skip: 5, take: 5 });
		});

		it("usa page=1 y limit=20 por defecto con query vacía {}", async () => {
			repository.listFavorites.mockResolvedValue({ items: [], total: 0, skip: 0, take: 20 });
			await expect(service.listFavorites({}, actor)).resolves.toEqual({ items: [], total: 0, page: 1, limit: 20 });
			expect(repository.listFavorites).toHaveBeenCalledWith(actor, { skip: 0, take: 20 });
		});

		it("usa page=1 y limit=20 por defecto", async () => {
			repository.listFavorites.mockResolvedValue({ items: [], total: 0, skip: 0, take: 20 });
			await expect(service.listFavorites(undefined, actor)).resolves.toEqual({ items: [], total: 0, page: 1, limit: 20 });
			expect(repository.listFavorites).toHaveBeenCalledWith(actor, { skip: 0, take: 20 });
		});

		it("rechaza limit > 100, page 0 y claves desconocidas como userId → 400", async () => {
			await expectStatus(service.listFavorites({ limit: 101 }, actor), 400);
			await expectStatus(service.listFavorites({ page: 0 }, actor), 400);
			await expectStatus(service.listFavorites({ userId: actor.id }, actor), 400);
			expect(repository.listFavorites).not.toHaveBeenCalled();
		});

		it("listar favoritos sin usuario → 401", async () => {
			await expectStatus(service.listFavorites({}, undefined), 401);
		});
	});

	describe("visitas", () => {
		it("registra visita con su idempotencyKey", async () => {
			const result = { counted: true, occurredAt: new Date() };
			repository.recordVisit.mockResolvedValue(result);
			await expect(service.recordVisit(workId, { idempotencyKey: key })).resolves.toBe(result);
			expect(repository.recordVisit).toHaveBeenCalledWith(workId, key);
		});

		it("idempotencyKey ausente, no UUID o con claves extra → 400", async () => {
			await expectStatus(service.recordVisit(workId, {}), 400);
			await expectStatus(service.recordVisit(workId, { idempotencyKey: "abc" }), 400);
			await expectStatus(service.recordVisit(workId, { idempotencyKey: key, userId: actor.id }), 400);
			expect(repository.recordVisit).not.toHaveBeenCalled();
		});

		it("idempotencyKey reutilizada en otro contexto → 409", async () => {
			repository.recordVisit.mockRejectedValue(new AppError("Idempotency key belongs to another request", 409));
			await expectStatus(service.recordVisit(workId, { idempotencyKey: key }), 409);
		});

		it("obra inexistente u oculta → 404", async () => {
			repository.recordVisit.mockRejectedValue(new AppError("Work not found", 404));
			await expectStatus(service.recordVisit(workId, { idempotencyKey: key }), 404);
		});

		it("error inesperado del repositorio → AppError 500 sin filtrar el mensaje original", async () => {
			repository.recordVisit.mockRejectedValue(new Error("connection string secret"));
			const error = await service.recordVisit(workId, { idempotencyKey: key }).catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(AppError);
			expect((error as AppError).statusCode).toBe(500);
			expect((error as AppError).message).not.toContain("secret");
		});
	});

	describe("lecturas", () => {
		it("registra lectura anónima (actor undefined)", async () => {
			repository.recordRead.mockResolvedValue({ counted: true, occurredAt: new Date() });
			await service.recordRead(chapterId, { idempotencyKey: key });
			expect(repository.recordRead).toHaveBeenCalledWith(chapterId, key, undefined);
		});

		it("registra lectura con el usuario autenticado", async () => {
			repository.recordRead.mockResolvedValue({ counted: true, occurredAt: new Date(), isRead: true });
			await service.recordRead(chapterId, { idempotencyKey: key }, actor);
			expect(repository.recordRead).toHaveBeenCalledWith(chapterId, key, actor);
		});

		it("idempotencyKey reutilizada en otro contexto → 409", async () => {
			repository.recordRead.mockRejectedValue(new AppError("Idempotency key belongs to another request", 409));
			await expectStatus(service.recordRead(chapterId, { idempotencyKey: key }, actor), 409);
		});

		it("capítulo inexistente u oculto → 404", async () => {
			repository.recordRead.mockRejectedValue(new AppError("Chapter not found", 404));
			await expectStatus(service.recordRead(chapterId, { idempotencyKey: key }), 404);
		});

		it("marcar/desmarcar leído exige usuario", async () => {
			await expectStatus(service.setReadState(chapterId, true), 401);
			repository.setReadState.mockResolvedValue(null);
			await service.setReadState(chapterId, false, actor);
			expect(repository.setReadState).toHaveBeenCalledWith(chapterId, false, actor);
		});
	});

	describe("rating", () => {
		it("convierte score 0..5 a medias estrellas y de vuelta", async () => {
			repository.setRating.mockResolvedValue({ workId, scoreHalfStars: 7 });
			await expect(service.setRating(workId, { score: 3.5 }, actor)).resolves.toEqual({ workId, score: 3.5 });
			expect(repository.setRating).toHaveBeenCalledWith(workId, 7, actor);
		});

		it("acepta score 0", async () => {
			repository.setRating.mockResolvedValue({ workId, scoreHalfStars: 0 });
			await expect(service.setRating(workId, { score: 0 }, actor)).resolves.toEqual({ workId, score: 0 });
		});

		it("score fuera de rango, no múltiplo de 0.5, string o claves extra → 400", async () => {
			for (const body of [{ score: 5.5 }, { score: -0.5 }, { score: 2.3 }, { score: "3" }, { score: 3, userId: actor.id }, {}]) {
				await expectStatus(service.setRating(workId, body, actor), 400);
			}
			expect(repository.setRating).not.toHaveBeenCalled();
		});

		it("sin usuario → 401", async () => {
			await expectStatus(service.setRating(workId, { score: 3 }), 401);
		});

		it("obra inexistente u oculta → 404", async () => {
			repository.setRating.mockRejectedValue(new AppError("Work not found", 404));
			await expectStatus(service.setRating(workId, { score: 3 }, actor), 404);
		});

		it("retirar valoración pasa null con el usuario autenticado", async () => {
			repository.setRating.mockResolvedValue({ workId, scoreHalfStars: null });
			await service.removeRating(workId, actor);
			expect(repository.setRating).toHaveBeenCalledWith(workId, null, actor);
			await expectStatus(service.removeRating(workId), 401);
		});
	});

	describe("progreso, historial, calendario y stats", () => {
		it("calcula porcentaje de progreso y score", async () => {
			repository.getWorkState.mockResolvedValue({
				workId, isFavorite: true, scoreHalfStars: 9, totalChapters: 4, readChapters: 1,
				chapters: { items: [], total: 4, skip: 0, take: 20 }
			});
			await expect(service.getProgress(workId, {}, actor)).resolves.toEqual({
				workId, isFavorite: true, score: 4.5, totalChapters: 4, readChapters: 1, completionPercentage: 25,
				chapters: { items: [], total: 4, page: 1, limit: 20 }
			});
		});

		it("progreso con 0 capítulos → 0% y sin score → null", async () => {
			repository.getWorkState.mockResolvedValue({
				workId, isFavorite: false, scoreHalfStars: null, totalChapters: 0, readChapters: 0,
				chapters: { items: [], total: 0, skip: 0, take: 20 }
			});
			const result = await service.getProgress(workId, {}, actor);
			expect(result.completionPercentage).toBe(0);
			expect(result.score).toBeNull();
		});

		it("historial exige usuario", async () => {
			await expectStatus(service.listHistory({}), 401);
		});

		it("calendario rellena días sin actividad con 0", async () => {
			repository.getCalendar.mockResolvedValue([{ date: "2026-01-02", chaptersRead: 3 }]);
			const result = await service.getCalendar({ from: "2026-01-01", to: "2026-01-03" }, actor);
			expect(result.days).toEqual([
				{ date: "2026-01-01", chaptersRead: 0 },
				{ date: "2026-01-02", chaptersRead: 3 },
				{ date: "2026-01-03", chaptersRead: 0 }
			]);
			expect(repository.getCalendar).toHaveBeenCalledWith(actor, "2026-01-01", "2026-01-03");
		});

		it("calendario con rango invertido, > 366 días o fecha imposible → 400", async () => {
			await expectStatus(service.getCalendar({ from: "2026-01-03", to: "2026-01-01" }, actor), 400);
			await expectStatus(service.getCalendar({ from: "2024-01-01", to: "2025-01-02" }, actor), 400);
			await expectStatus(service.getCalendar({ from: "2026-02-30" }, actor), 400);
			expect(repository.getCalendar).not.toHaveBeenCalled();
		});

		it("stats personales exigen usuario; stats de obra son públicas", async () => {
			await expectStatus(service.getStats(), 401);
			repository.getWorkStats.mockResolvedValue({ workId });
			await service.getWorkStats(workId);
			expect(repository.getWorkStats).toHaveBeenCalledWith(workId);
		});
	});
});
