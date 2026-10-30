import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublishedWork, prisma } from "../../__integration__/fixtures";
import { MediaCleanupRepository } from "../../repositories/catalog/media-cleanup.repository";
import { runMediaCleanup } from "../media/media-cleanup.service";

const repository = new MediaCleanupRepository(prisma);
const old = new Date(Date.now() - 3 * 24 * 3_600_000);
let data: Awaited<ReturnType<typeof createPublishedWork>>;
const hex = () => randomUUID().replace(/-/g, "").slice(0, 4);

async function asset(createdAt = old) {
	const pathname = `cleanup-${randomUUID().slice(0, 8)}/Covers/${hex()}.png`;
	return prisma.mediaAsset.create({ data: { pathname, url: `https://blob.test/${pathname}`, contentType: "image/png", sizeBytes: 10n, createdById: data.user.id, createdAt } });
}
async function run(apply: boolean, remove = async (_: string) => {}) {
	const removed: string[] = [];
	const report = await runMediaCleanup({ apply, batchSize: 10_000, repository, remove: async pathname => { await remove(pathname); removed.push(pathname); } });
	return { report, removed };
}

beforeAll(async () => { data = await createPublishedWork(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("limpieza de imágenes huérfanas", () => {
	it("dry-run solo informa: no crea jobs ni borra", async () => {
		const orphan = await asset();
		const { report, removed } = await run(false);
		expect(report.dryRun).toBe(true);
		expect(removed).toEqual([]);
		expect(await prisma.mediaCleanupJob.count({ where: { pathname: orphan.pathname } })).toBe(0);
	});

	it("borra assets sin referencias y deja intactos los referenciados y los recientes", async () => {
		const orphan = await asset();
		const cover = await asset();
		const banner = await asset();
		await prisma.work.update({ where: { id: data.work.id }, data: { coverAssetId: cover.id, bannerAssetId: banner.id } });
		const recent = await asset(new Date());
		const { removed } = await run(true);
		expect(removed).toContain(orphan.pathname);
		expect(removed).not.toContain(cover.pathname);
		expect(removed).not.toContain(banner.pathname);
		expect(removed).not.toContain(recent.pathname);
		expect(await prisma.mediaCleanupJob.findFirstOrThrow({ where: { pathname: orphan.pathname } })).toMatchObject({ status: "COMPLETED", attempts: 1 });
		expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: orphan.id } })).status).toBe("DELETING");
		// Idempotente: una segunda corrida no lo vuelve a borrar.
		expect((await run(true)).removed).not.toContain(orphan.pathname);
	});

	it("borra los archivos de lotes abandonados y los marca CLEANED", async () => {
		const batch = await prisma.uploadBatch.create({ data: { requestedById: data.user.id, workId: data.work.id, status: "ABANDONED", createdAt: old, expiresAt: new Date(old.getTime() + 3_600_000) } });
		const pathname = `cleanup-${randomUUID().slice(0, 8)}/Covers/${hex()}.webp`;
		await prisma.uploadObject.create({ data: { batchId: batch.id, pathname, status: "UPLOADED" } });
		const { removed } = await run(true);
		expect(removed).toContain(pathname);
		expect((await prisma.uploadObject.findUniqueOrThrow({ where: { pathname } })).status).toBe("CLEANED");
	});

	it("si el archivo volvió a usarse antes de borrarlo, lo salta", async () => {
		const reused = await asset();
		await repository.enqueue([{ assetId: reused.id, pathname: reused.pathname }]);
		await prisma.work.update({ where: { id: data.work.id }, data: { incapBannerAssetId: reused.id } });
		const { removed } = await run(true);
		expect(removed).not.toContain(reused.pathname);
		expect(await prisma.mediaCleanupJob.findFirstOrThrow({ where: { pathname: reused.pathname } })).toMatchObject({ status: "COMPLETED", lastErrorCode: "REFERENCED" });
	});

	it("si Blob falla, reintenta más tarde con espera creciente", async () => {
		const orphan = await asset();
		const { report } = await run(true, async pathname => { if (pathname === orphan.pathname) throw new Error("BLOB_DOWN"); });
		expect(report.failed).toBeGreaterThanOrEqual(1);
		const job = await prisma.mediaCleanupJob.findFirstOrThrow({ where: { pathname: orphan.pathname } });
		expect(job).toMatchObject({ status: "FAILED", attempts: 1, lastErrorCode: "BLOB_DOWN" });
		expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
		expect((await run(true)).removed).not.toContain(orphan.pathname);
	});
});
