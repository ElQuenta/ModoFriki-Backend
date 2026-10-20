import { del } from "@vercel/blob";
import type { MediaRepositoryContract } from "../../types/catalog.types";
import config from "../../config/env";
import { createLogger } from "../../utils/logger";

const logger = createLogger("MediaCleanup");
type CleanupRepository = Pick<MediaRepositoryContract, "reconcileExpiredBatches" | "claimCleanup" | "completeCleanup" | "failCleanup">;
export type DeleteMedia = (pathname: string) => Promise<void>;
const deleteMedia: DeleteMedia = async (pathname) => {
	if (!config.blob.readWriteToken) throw new Error("MEDIA_NOT_CONFIGURED");
	await del(pathname, { token: config.blob.readWriteToken });
};

/** claimCleanup atomically fences unreferenced assets as DELETING; repositories own all ref checks. */
export async function runMediaCleanup(repository: CleanupRepository, remove: DeleteMedia = deleteMedia): Promise<void> {
	try {
		await repository.reconcileExpiredBatches(100);
		for (const job of await repository.claimCleanup(50)) {
			try {
				await remove(job.pathname);
				await repository.completeCleanup(job.id);
			} catch {
				logger.warn("Media cleanup deferred for retry");
				await repository.failCleanup(job.id, "BLOB_DELETE_FAILED");
			}
		}
	} catch { logger.error("Unable to process media cleanup queue"); }
}

export function startMediaCleanup(repository: CleanupRepository, intervalMs = 60_000): () => void {
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try { await runMediaCleanup(repository); } finally { running = false; }
	};
	const timer = setInterval(() => void tick(), intervalMs);
	timer.unref();
	void tick();
	return () => clearInterval(timer);
}
