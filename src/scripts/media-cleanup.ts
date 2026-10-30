import prisma from "../config/database/postgres";
import { runMediaCleanup } from "../services/media/media-cleanup.service";
import { createLogger } from "../utils/logger";

// npm run media:cleanup             → dry-run: lists orphan files, changes nothing
// npm run media:cleanup -- --apply  → queues MediaCleanupJob rows and removes the files from Blob
const logger = createLogger("MediaCleanup");
const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
	try {
		const report = await runMediaCleanup({ apply });
		logger.info(`Media cleanup ${apply ? "applied" : "dry-run"}: ${JSON.stringify(report)}`);
		if (report.failed) process.exitCode = 1;
	} catch {
		logger.error("Media cleanup failed; check database availability and BLOB_READ_WRITE_TOKEN");
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
}

void main();
