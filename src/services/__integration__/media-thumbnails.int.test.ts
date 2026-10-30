import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublishedWork, prisma } from "../../__integration__/fixtures";
import { MediaCleanupRepository } from "../../repositories/catalog/media-cleanup.repository";
import { MediaThumbnailRepository } from "../../repositories/catalog/media-thumbnail.repository";
import { generateThumbnails } from "../media/media-thumbnail.service";

const repository = new MediaThumbnailRepository(prisma);
let png: Buffer;
let data: Awaited<ReturnType<typeof createPublishedWork>>;
const stored = new Map<string, Buffer>();
const fakePut = async (pathname: string, body: Buffer) => { stored.set(pathname, body); return { url: `https://blob.test/${pathname}` }; };

async function setCover(workId: string, createdAt = new Date()) {
	const pathname = `thumb-${randomUUID().slice(0, 8)}/Covers/${randomUUID().slice(0, 4).replace(/[^a-f0-9]/g, "a")}.png`;
	const cover = await prisma.mediaAsset.create({ data: { pathname, url: `https://blob.test/${pathname}`, contentType: "image/png", sizeBytes: BigInt(png.length), createdById: data.user.id, createdAt } });
	await prisma.$executeRaw`UPDATE "Work" SET "coverAssetId" = ${cover.id}::uuid WHERE "id" = ${workId}::uuid`;
	return cover;
}
const run = (fetchImage = async () => png) => generateThumbnails({ repository, fetch: fetchImage, put: fakePut, batchSize: 10_000 });

beforeAll(async () => {
	png = await sharp({ create: { width: 900, height: 1350, channels: 3, background: "#ff6600" } }).png().toBuffer();
	data = await createPublishedWork();
});
afterAll(async () => { await prisma.$disconnect(); });

describe("miniaturas de portadas", () => {
	it("crea una WebP de 300 px, la enlaza y no cambia updatedAt de la obra", async () => {
		const cover = await setCover(data.work.id);
		const before = await prisma.work.findUniqueOrThrow({ where: { id: data.work.id } });
		await run();
		const work = await prisma.work.findUniqueOrThrow({ where: { id: data.work.id }, include: { coverThumbAsset: true } });
		expect(work.coverThumbAsset).toMatchObject({ contentType: "image/webp", width: 300, height: 450 });
		expect(work.coverThumbAsset!.pathname.startsWith(cover.pathname.split("/")[0] + "/Covers/")).toBe(true);
		expect((await sharp(stored.get(work.coverThumbAsset!.pathname)!).metadata()).format).toBe("webp");
		expect(work.updatedAt.getTime()).toBe(before.updatedAt.getTime());
	});

	it("es idempotente: no regenera si la miniatura está al día", async () => {
		const thumbId = (await prisma.work.findUniqueOrThrow({ where: { id: data.work.id } })).coverThumbAssetId;
		await run();
		expect((await prisma.work.findUniqueOrThrow({ where: { id: data.work.id } })).coverThumbAssetId).toBe(thumbId);
	});

	it("regenera cuando la portada cambia", async () => {
		const oldThumb = (await prisma.work.findUniqueOrThrow({ where: { id: data.work.id } })).coverThumbAssetId;
		await setCover(data.work.id, new Date(Date.now() + 1000));
		await run();
		expect((await prisma.work.findUniqueOrThrow({ where: { id: data.work.id } })).coverThumbAssetId).not.toBe(oldThumb);
	});

	it("no enlaza si la portada cambió mientras se generaba", async () => {
		const other = await createPublishedWork();
		await setCover(other.work.id);
		await run(async () => { await setCover(other.work.id, new Date(Date.now() + 2000)); return png; });
		expect((await prisma.work.findUniqueOrThrow({ where: { id: other.work.id } })).coverThumbAssetId).toBeNull();
	});

	it("una miniatura enlazada nunca es candidata a limpieza", async () => {
		const thumb = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: (await prisma.work.findUniqueOrThrow({ where: { id: data.work.id } })).coverThumbAssetId! } });
		const candidates = await new MediaCleanupRepository(prisma).findCandidates(new Date(Date.now() + 86_400_000), 100_000);
		expect(candidates.map(c => c.pathname)).not.toContain(thumb.pathname);
	});

	it("si la portada no se puede leer, lo cuenta como fallo y sigue", async () => {
		const broken = await createPublishedWork();
		await setCover(broken.work.id);
		const report = await run(async () => { throw new Error("SOURCE_UNAVAILABLE"); });
		expect(report.failed).toBeGreaterThanOrEqual(1);
		expect((await prisma.work.findUniqueOrThrow({ where: { id: broken.work.id } })).coverThumbAssetId).toBeNull();
	});
});
