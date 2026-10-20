import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DiscoveryRepositoryContract, LatestChapter, LatestChaptersQuery, Paginated } from "../../types/discovery.types";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { summarySelect, visibleChapter, workSummary } from "../reading/reading.persistence";

const logger = createLogger("DiscoveryRepository");

export class DiscoveryRepository implements DiscoveryRepositoryContract {
	constructor(private readonly client: PrismaClient = prisma) {}

	private async run<T>(message: string, action: () => Promise<T>): Promise<T> {
		try { logger.debug(message); return await action(); }
		catch (error) { return catchAndLogError(logger, error, message); }
	}

	async listLatestChapters({ page, limit, typeId }: LatestChaptersQuery): Promise<Paginated<LatestChapter>> {
		return this.run("Unable to list latest chapters", async () => {
			const where = { ...visibleChapter, publishedAt: { not: null }, work: { ...visibleChapter.work, ...(typeId ? { typeId } : {}) } };
			const [chapters, total] = await this.client.$transaction([
				this.client.chapter.findMany({
					where,
					orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
					skip: (page - 1) * limit,
					take: limit,
					select: { id: true, workId: true, number: true, title: true, kind: true, publishedAt: true, work: { select: summarySelect } }
				}),
				this.client.chapter.count({ where })
			]);
			const items = chapters.map(chapter => ({ ...chapter, number: chapter.number.toString(), publishedAt: chapter.publishedAt!, work: workSummary(chapter.work) }));
			return { items, total, page, limit };
		});
	}
}

export const discoveryRepository = new DiscoveryRepository();
