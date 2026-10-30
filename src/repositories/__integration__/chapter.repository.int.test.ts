import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublishedWork, prisma } from "../../__integration__/fixtures";
import { ChapterRepository } from "../catalog/chapter.repository";

const repository = new ChapterRepository(prisma);
let data: Awaited<ReturnType<typeof createPublishedWork>>;

beforeAll(async () => { data = await createPublishedWork(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("ChapterRepository contra PostgreSQL real", () => {
	it("el número de capítulo es único por obra (409)", async () => {
		await expect(repository.reserve(randomUUID(), data.work.id, { number: "1" } as never, data.actor)).rejects.toMatchObject({ statusCode: 409 });
	});

	it("la base rechaza un número duplicado aunque se salte el repositorio", async () => {
		await expect(prisma.chapter.create({ data: { workId: data.work.id, number: 1, createdById: data.user.id, updatedById: data.user.id } }))
			.rejects.toMatchObject({ code: "P2002" });
	});

	it("borrar con una versión vieja da 409 y no cambia el capítulo (concurrencia optimista)", async () => {
		await expect(repository.remove(data.work.id, data.chapter.id, data.actor, data.chapter.version + 5)).rejects.toMatchObject({ statusCode: 409 });
		const current = await prisma.chapter.findUniqueOrThrow({ where: { id: data.chapter.id } });
		expect(current.deletedAt).toBeNull();
		expect(current.version).toBe(data.chapter.version);
	});

	it("borrar con la versión vigente funciona y sube la versión", async () => {
		await repository.remove(data.work.id, data.chapter.id, data.actor, data.chapter.version);
		const current = await prisma.chapter.findUniqueOrThrow({ where: { id: data.chapter.id } });
		expect(current.deletedAt).not.toBeNull();
		expect(current.version).toBe(data.chapter.version + 1);
	});
});
