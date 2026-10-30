import { del } from "@vercel/blob";
import config from "../../config/env";
import { mediaCleanupRepository, type MediaCleanupRepository } from "../../repositories/catalog/media-cleanup.repository";
import { assertMediaPath } from "../../utils/media-paths";
import { createLogger } from "../../utils/logger";

const logger = createLogger("MediaCleanup");

export type RemoveFile = (pathname: string) => Promise<void>;
export const removeFromBlob: RemoveFile = async pathname => {
	if (!config.blob.readWriteToken) throw new Error("MEDIA_NOT_CONFIGURED");
	await del(pathname, { token: config.blob.readWriteToken, abortSignal: AbortSignal.timeout(30_000) });
};

export interface MediaCleanupOptions {
	/** false = only report what would be removed (default). */
	apply: boolean;
	/** Files younger than this are never touched (in-flight uploads, recent replacements). */
	graceMs?: number;
	batchSize?: number;
	now?: Date;
	repository?: Pick<MediaCleanupRepository, "findCandidates" | "enqueue" | "claimDue" | "isStillOrphan" | "complete" | "skip" | "fail">;
	remove?: RemoveFile;
}

export interface MediaCleanupReport { candidates: number; queued: number; removed: number; skipped: number; failed: number; dryRun: boolean }

export async function runMediaCleanup(options: MediaCleanupOptions): Promise<MediaCleanupReport> {
	const { apply, graceMs = 24 * 3_600_000, batchSize = 200, now = new Date(), repository = mediaCleanupRepository, remove = removeFromBlob } = options;
	const candidates = await repository.findCandidates(new Date(now.getTime() - graceMs), batchSize);
	const report: MediaCleanupReport = { candidates: candidates.length, queued: 0, removed: 0, skipped: 0, failed: 0, dryRun: !apply };
	if (!apply) {
		for (const candidate of candidates) logger.info(`[dry-run] would remove ${candidate.pathname}`);
		return report;
	}
	report.queued = await repository.enqueue(candidates);
	// Clock read after enqueueing: new jobs get nextAttemptAt = now() in the database, so they are due in this same run.
	const claimedAt = options.now ?? new Date();
	for (const job of await repository.claimDue(claimedAt, batchSize)) {
		try {
			if (!await repository.isStillOrphan(job)) { await repository.skip(job); report.skipped++; continue; }
			assertMediaPath(job.pathname);
			await remove(job.pathname);
			await repository.complete(job);
			report.removed++;
		} catch (error) {
			// Never log tokens or provider messages: only a short code.
			const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : error instanceof Error ? error.name : "UNKNOWN";
			await repository.fail(job, claimedAt, code);
			report.failed++;
		}
	}
	return report;
}
