import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";

export interface PendingThumbnail { workId: string; coverAssetId: string; coverUrl: string; coverPathname: string; ownerId: string }
export interface NewThumbnail { id: string; pathname: string; url: string; size: number; width: number; height: number }

export class MediaThumbnailRepository {
	constructor(private readonly client: PrismaClient = prisma) {}

	/** Live works whose cover has no thumbnail, or whose thumbnail is older than the current cover. */
	async findPending(take: number): Promise<PendingThumbnail[]> {
		return this.client.$queryRaw<PendingThumbnail[]>`
			SELECT w."id" AS "workId", c."id" AS "coverAssetId", c."url" AS "coverUrl", c."pathname" AS "coverPathname", w."createdById" AS "ownerId"
			FROM "Work" w
			JOIN "MediaAsset" c ON c."id" = w."coverAssetId" AND c."status" = 'AVAILABLE'
			LEFT JOIN "MediaAsset" t ON t."id" = w."coverThumbAssetId"
			WHERE w."deletedAt" IS NULL AND (t."id" IS NULL OR t."createdAt" < c."createdAt")
			ORDER BY w."createdAt" ASC, w."id" ASC
			LIMIT ${take}`;
	}

	/**
	 * Records the asset and links it only if the cover is still the one it was made from.
	 * Raw UPDATE so Work.updatedAt (the edit concurrency token) is not bumped. Returns false when the
	 * cover changed meanwhile; the unlinked asset is then an orphan for media:cleanup.
	 */
	async link(item: PendingThumbnail, thumb: NewThumbnail): Promise<boolean> {
		return this.client.$transaction(async tx => {
			await tx.mediaAsset.create({ data: { id: thumb.id, pathname: thumb.pathname, url: thumb.url, contentType: "image/webp", sizeBytes: BigInt(thumb.size), width: thumb.width, height: thumb.height, createdById: item.ownerId } });
			const linked = await tx.$executeRaw`UPDATE "Work" SET "coverThumbAssetId" = ${thumb.id}::uuid WHERE "id" = ${item.workId}::uuid AND "coverAssetId" = ${item.coverAssetId}::uuid AND "deletedAt" IS NULL`;
			return linked > 0;
		});
	}
}

export const mediaThumbnailRepository = new MediaThumbnailRepository();
