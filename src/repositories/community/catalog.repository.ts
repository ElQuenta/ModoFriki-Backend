import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("CatalogRepository");

export interface CatalogRepositoryContract {
	findWork(id: string): Promise<{ id: string } | null>;
	findChapter(id: string): Promise<{ id: string; workId: string } | null>;
}

export class CatalogRepository implements CatalogRepositoryContract {
	constructor(private readonly client: Pick<PrismaClient, "work" | "chapter"> = prisma) {}

	async findWork(id: string): Promise<{ id: string } | null> {
		try {
			logger.debug("Finding published comment destination work");
			return await this.client.work.findUnique({
				where: { id, publicationStatus: "PUBLISHED", deletedAt: null }, select: { id: true }
			});
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to find work");
		}
	}

	async findChapter(id: string): Promise<{ id: string; workId: string } | null> {
		try {
			logger.debug("Finding published comment destination chapter");
			return await this.client.chapter.findUnique({
				where: { id, status: "PUBLISHED", deletedAt: null,
					work: { publicationStatus: "PUBLISHED", deletedAt: null } },
				select: { id: true, workId: true }
			});
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to find chapter");
		}
	}
}

export const catalogRepository = new CatalogRepository();
