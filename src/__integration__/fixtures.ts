import { randomUUID } from "node:crypto";
import prisma from "../config/database/postgres";

// Each test file creates its own isolated rows (random ids): no dependency on seeds or other tests.
export async function createPublishedWork() {
	const tag = randomUUID().slice(0, 8);
	const user = await prisma.user.create({ data: { email: `int-${tag}@modofriki.local`, emailNormalized: `int-${tag}@modofriki.local`, username: `int_${tag}`, usernameNormalized: `int_${tag}`, passwordHash: "x", role: "ADMIN", timezone: "America/La_Paz" } });
	const type = await prisma.workType.create({ data: { name: `Tipo ${tag}`, slug: `tipo-${tag}` } });
	const work = await prisma.work.create({ data: { title: `Obra ${tag}`, slug: `obra-${tag}`, synopsis: "Integración", typeId: type.id, publicationStatus: "PUBLISHED", publishedAt: new Date(), createdById: user.id, updatedById: user.id } });
	const chapter = await prisma.chapter.create({ data: { workId: work.id, number: 1, status: "PUBLISHED", publishedAt: new Date(), createdById: user.id, updatedById: user.id } });
	return { user, work, chapter, actor: { id: user.id, timezone: user.timezone, role: user.role } };
}

export { prisma };
