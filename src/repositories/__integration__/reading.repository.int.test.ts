import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublishedWork, prisma } from "../../__integration__/fixtures";
import { ReadingRepository } from "../reading/reading.repository";

const repository = new ReadingRepository(prisma);
let data: Awaited<ReturnType<typeof createPublishedWork>>;

beforeAll(async () => { data = await createPublishedWork(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("ReadingRepository contra PostgreSQL real", () => {
	it("una visita con el mismo idempotencyKey suma una sola vez", async () => {
		const key = randomUUID();
		expect((await repository.recordVisit(data.work.id, key)).counted).toBe(true);
		expect((await repository.recordVisit(data.work.id, key)).counted).toBe(false);
		const work = await prisma.work.findUniqueOrThrow({ where: { id: data.work.id } });
		expect(work.visitsCount).toBe(1);
		expect(await prisma.workVisitEvent.count({ where: { idempotencyKey: key } })).toBe(1);
	});

	it("reusar un idempotencyKey de visita en otra obra es un conflicto (409)", async () => {
		const key = randomUUID();
		await repository.recordVisit(data.work.id, key);
		const other = await createPublishedWork();
		await expect(repository.recordVisit(other.work.id, key)).rejects.toMatchObject({ statusCode: 409 });
	});

	it("una lectura con el mismo idempotencyKey no suma dos veces", async () => {
		const key = randomUUID();
		expect((await repository.recordRead(data.chapter.id, key)).counted).toBe(true);
		expect((await repository.recordRead(data.chapter.id, key)).counted).toBe(false);
		expect(await prisma.chapterReadEvent.count({ where: { idempotencyKey: key } })).toBe(1);
	});

	it("un usuario cuenta una sola lectura por capítulo y día local (racha)", async () => {
		const fresh = await createPublishedWork();
		expect((await repository.recordRead(fresh.chapter.id, randomUUID(), fresh.actor)).counted).toBe(true);
		// Otra clave el mismo día: se guarda el alias, pero no un segundo evento.
		expect((await repository.recordRead(fresh.chapter.id, randomUUID(), fresh.actor)).counted).toBe(false);
		expect(await prisma.chapterReadEvent.count({ where: { userId: fresh.user.id } })).toBe(1);
		const stats = await repository.getStats(fresh.actor);
		expect(stats).toMatchObject({ readsToday: 1, activeDays: 1, currentStreak: 1, recordedReads: 1 });
	});

	it("las lecturas anónimas siguen siendo eventos distintos", async () => {
		await repository.recordRead(data.chapter.id, randomUUID());
		await repository.recordRead(data.chapter.id, randomUUID());
		expect(await prisma.chapterReadEvent.count({ where: { chapterId: data.chapter.id, userId: null } })).toBeGreaterThanOrEqual(2);
	});
});
