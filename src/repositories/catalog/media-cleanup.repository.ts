import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";

// A file is only removable when nothing points at it. Checked when queued AND again when claimed.
const unreferenced = { pages: { none: {} }, workCovers: { none: {} }, coverThumbs: { none: {} }, incapBanners: { none: {} }, siteSettings: { none: {} } };
const noPendingBatch = { uploadObjects: { none: { batch: { status: "PENDING" as const } } } };
export const CLEANUP_MAX_ATTEMPTS = 5;

export interface CleanupCandidate { assetId: string | null; pathname: string }
export interface ClaimedCleanupJob { id: string; assetId: string | null; pathname: string; attempts: number }

export class MediaCleanupRepository {
	constructor(private readonly client: PrismaClient = prisma) {}

	/** Orphans older than `before`: unreferenced assets and files of abandoned/expired upload batches. */
	async findCandidates(before: Date, take: number): Promise<CleanupCandidate[]> {
		const queued = { cleanupJobs: { none: {} } };
		const assets = await this.client.mediaAsset.findMany({
			where: { createdAt: { lt: before }, ...unreferenced, ...noPendingBatch, ...queued },
			select: { id: true, pathname: true }, orderBy: { createdAt: "asc" }, take
		});
		const objects = await this.client.uploadObject.findMany({
			where: { assetId: null, status: { in: ["PLANNED", "UPLOADED"] }, batch: { OR: [{ status: "ABANDONED", createdAt: { lt: before } }, { status: "PENDING", expiresAt: { lt: before } }] } },
			select: { pathname: true }, orderBy: { id: "asc" }, take
		});
		const jobs = new Set((await this.client.mediaCleanupJob.findMany({ where: { pathname: { in: objects.map(o => o.pathname) } }, select: { pathname: true } })).map(j => j.pathname));
		return [
			...assets.map(asset => ({ assetId: asset.id, pathname: asset.pathname })),
			...objects.filter(o => !jobs.has(o.pathname)).map(o => ({ assetId: null, pathname: o.pathname }))
		].slice(0, take);
	}

	async enqueue(candidates: CleanupCandidate[]): Promise<number> {
		if (!candidates.length) return 0;
		return (await this.client.mediaCleanupJob.createMany({ data: candidates })).count;
	}

	/** Atomically claims due jobs (stale RUNNING ones count as due after an hour). */
	async claimDue(now: Date, take: number): Promise<ClaimedCleanupJob[]> {
		const due = await this.client.mediaCleanupJob.findMany({
			where: { attempts: { lt: CLEANUP_MAX_ATTEMPTS }, OR: [{ status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } }, { status: "RUNNING", updatedAt: { lt: new Date(now.getTime() - 3_600_000) } }] },
			select: { id: true, status: true }, orderBy: { nextAttemptAt: "asc" }, take
		});
		const claimed: ClaimedCleanupJob[] = [];
		for (const job of due) {
			const won = await this.client.mediaCleanupJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: "RUNNING" } });
			if (won.count) claimed.push(await this.client.mediaCleanupJob.findUniqueOrThrow({ where: { id: job.id }, select: { id: true, assetId: true, pathname: true, attempts: true } }));
		}
		return claimed;
	}

	/** Last check right before deleting: the file must still be unreferenced. */
	async isStillOrphan(job: ClaimedCleanupJob): Promise<boolean> {
		const referenced = await this.client.mediaAsset.count({ where: { pathname: job.pathname, NOT: { ...unreferenced, ...noPendingBatch } } });
		if (referenced) return false;
		const live = await this.client.uploadObject.count({ where: { pathname: job.pathname, OR: [{ status: "LINKED", assetId: { not: null }, asset: { NOT: unreferenced } }, { batch: { status: { in: ["PENDING", "COMMITTED"] }, expiresAt: { gt: new Date() } } }] } });
		return live === 0;
	}

	async complete(job: ClaimedCleanupJob): Promise<void> {
		await this.client.$transaction(async tx => {
			await tx.mediaCleanupJob.update({ where: { id: job.id }, data: { status: "COMPLETED", attempts: { increment: 1 }, lastErrorCode: null } });
			await tx.uploadObject.updateMany({ where: { pathname: job.pathname, status: { not: "CLEANED" } }, data: { status: "CLEANED" } });
			if (job.assetId) await tx.mediaAsset.updateMany({ where: { id: job.assetId }, data: { status: "DELETING" } });
		});
	}

	/** Skipped (now referenced again): done without touching the file. */
	async skip(job: ClaimedCleanupJob): Promise<void> {
		await this.client.mediaCleanupJob.update({ where: { id: job.id }, data: { status: "COMPLETED", lastErrorCode: "REFERENCED" } });
	}

	async fail(job: ClaimedCleanupJob, now: Date, errorCode: string): Promise<void> {
		const attempts = job.attempts + 1;
		// Exponential backoff: 2, 4, 8, 16 minutes.
		await this.client.mediaCleanupJob.update({ where: { id: job.id }, data: { status: "FAILED", attempts, lastErrorCode: errorCode.slice(0, 100), nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60_000) } });
	}
}

export const mediaCleanupRepository = new MediaCleanupRepository();
