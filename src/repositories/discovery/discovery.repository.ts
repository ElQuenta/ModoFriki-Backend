import prisma from "../../config/database/postgres";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { DiscoveryRepositoryContract, LatestChapter, LatestChaptersQuery, Paginated, PopularWork, PopularWorksQuery, RecommendedWorks, RecommendedWorksQuery } from "../../types/discovery.types";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { summarySelect, visibleChapter, visibleWork, workSummary } from "../reading/reading.persistence";

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

	async listPopularWorks({ period, page, limit, typeId }: PopularWorksQuery): Promise<Paginated<PopularWork>> {
		return this.run("Unable to list popular works", async () => {
			const since = period === "day" ? new Date(Date.now() - 86_400_000) : new Date(0);
			const typeFilter = typeId ? Prisma.sql`AND w."typeId" = ${typeId}::uuid` : Prisma.empty;
			const [rows, total] = await this.client.$transaction([
				this.client.$queryRaw<{ id: string; visits: bigint }[]>`
					SELECT w."id", COUNT(v."id") AS visits
					FROM "Work" w
					LEFT JOIN "WorkVisitEvent" v ON v."workId" = w."id" AND v."occurredAt" >= ${since}
					WHERE w."publicationStatus" = 'PUBLISHED' AND w."deletedAt" IS NULL ${typeFilter}
					GROUP BY w."id"
					ORDER BY visits DESC, w."publishedAt" DESC NULLS LAST, w."id" DESC
					LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
				this.client.work.count({ where: { ...visibleWork, ...(typeId ? { typeId } : {}) } })
			]);
			return { items: await this.hydrate(rows), total, page, limit };
		});
	}

	async listRecommendedWorks({ userId, limit }: RecommendedWorksQuery): Promise<RecommendedWorks> {
		return this.run("Unable to list recommended works", async () => {
			const uid = userId ?? null;
			const [rows, withGenres] = await Promise.all([
				this.client.$queryRaw<{ id: string; visits: bigint }[]>`
					SELECT w."id",
						(SELECT COUNT(*) FROM "WorkVisitEvent" v WHERE v."workId" = w."id") AS visits,
						(SELECT COUNT(*) FROM "WorkGenre" wg WHERE wg."workId" = w."id" AND wg."genreId" IN (
							SELECT fg."genreId" FROM "Favorite" f JOIN "WorkGenre" fg ON fg."workId" = f."workId"
							WHERE f."userId" = ${uid}::uuid)) AS matched
					FROM "Work" w
					WHERE w."publicationStatus" = 'PUBLISHED' AND w."deletedAt" IS NULL
						AND NOT EXISTS (SELECT 1 FROM "Favorite" f WHERE f."workId" = w."id" AND f."userId" = ${uid}::uuid)
					ORDER BY matched DESC, visits DESC, w."publishedAt" DESC NULLS LAST, w."id" DESC
					LIMIT ${limit}`,
				userId ? this.client.favorite.count({ where: { userId, work: { genres: { some: {} } } } }) : Promise.resolve(0)
			]);
			return { basis: withGenres > 0 ? "genres" : "popular", items: await this.hydrate(rows) };
		});
	}

	private async hydrate(rows: { id: string; visits: bigint }[]): Promise<PopularWork[]> {
		const works = await this.client.work.findMany({ where: { id: { in: rows.map(row => row.id) } }, select: summarySelect });
		const byId = new Map(works.map(work => [work.id, workSummary(work)]));
		return rows.flatMap(row => {
			const work = byId.get(row.id);
			return work ? [{ work, visits: Number(row.visits) }] : [];
		});
	}
}

export const discoveryRepository = new DiscoveryRepository();
