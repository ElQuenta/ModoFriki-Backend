import prisma from "../config/database/postgres";
import { generateThumbnails } from "../services/media/media-thumbnail.service";
import { createLogger } from "../utils/logger";

// npm run media:thumbnails → creates the missing/outdated WebP cover thumbnails (300 px). Additive: never deletes.
const logger = createLogger("MediaThumbnails");

async function main(): Promise<void> {
	try {
		const report = await generateThumbnails();
		logger.info(`Cover thumbnails: ${JSON.stringify(report)}`);
		if (report.failed) process.exitCode = 1;
	} catch {
		logger.error("Thumbnail generation failed; check database availability and BLOB_READ_WRITE_TOKEN");
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
}

void main();
