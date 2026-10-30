import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublishedWork, prisma } from "../../__integration__/fixtures";
import { WorkRepository } from "../catalog/work.repository";

const repository = new WorkRepository(prisma);
let data: Awaited<ReturnType<typeof createPublishedWork>>;

beforeAll(async () => { data = await createPublishedWork(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("WorkRepository contra PostgreSQL real", () => {
	it("borrar una obra suelta todas sus imágenes, miniatura incluida, para la limpieza", async () => {
		const thumb = await prisma.mediaAsset.create({ data: { pathname: `fixtures/${data.work.id}/thumb.webp`, url: "https://fixtures.invalid/thumb.webp", contentType: "image/webp", sizeBytes: 1, createdById: data.user.id } });
		const work = await prisma.work.update({ where: { id: data.work.id }, data: { coverThumbAssetId: thumb.id } });
		await repository.remove(work.id, data.actor, work.updatedAt);
		expect(await prisma.work.findUniqueOrThrow({ where: { id: work.id } })).toMatchObject({ coverAssetId: null, bannerAssetId: null, incapBannerAssetId: null, coverThumbAssetId: null });
	});
});
