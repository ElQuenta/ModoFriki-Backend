import type { Prisma } from "../../generated/prisma/client";
import type { AssetInput, CatalogActor } from "../../types/catalog.types";
import AppError from "../../utils/AppError";

export const workInclude = { type: true, coverAsset: true, incapBannerAsset: true, alternativeTitles: true, genres: { include: { genre: true } } } as const;
export const chapterInclude = { pages: { include: { asset: true }, orderBy: { position: "asc" as const } } } as const;
export type Transaction = Prisma.TransactionClient;
export async function lockWork(tx: Transaction, workId: string) {
 await tx.$queryRaw`SELECT "id" FROM "Work" WHERE "id" = ${workId}::uuid FOR UPDATE`;
}
export async function authorize(tx: Transaction, actor: CatalogActor, workId?: string) {
 const user = await tx.user.findUnique({ where: { id: actor.id, status: "ACTIVE", deletedAt: null } });
 if (!user || (user.role !== "ADMIN" && user.role !== "EDITOR")) throw new AppError("Insufficient permissions", 403);
 if (user.role === "ADMIN") return;
 if (!workId || !await tx.workEditorAssignment.findFirst({ where: { workId, editorId: actor.id, revokedAt: null } })) throw new AppError("Work is not assigned to this editor", 403);
}
export async function canSeeDraft(tx: Pick<Transaction, "user" | "workEditorAssignment">, actor?: CatalogActor, workId?: string) {
 if (!actor) return false;
 const user = await tx.user.findUnique({ where: { id: actor.id, status: "ACTIVE", deletedAt: null } });
 if (user?.role === "ADMIN") return true;
 return user?.role === "EDITOR" && !!workId && !!await tx.workEditorAssignment.findFirst({ where: { workId, editorId: actor.id, revokedAt: null } });
}
export async function guardPending(tx: Transaction, workId: string, batchId?: string) {
 const pending = await tx.uploadBatch.findFirst({ where: { status: "PENDING", OR: [{ workId }, { chapter: { workId } }], ...(batchId ? { id: { not: batchId } } : {}) } });
 if (pending) throw new AppError("Another upload is pending for this work", 409);
}
export async function linkAssets(tx: Transaction, actorId: string, workId: string, chapterId: string | undefined, assets: AssetInput[], batchId?: string) {
 if (!assets.length && !batchId) return;
 if (!batchId) throw new AppError("Upload batch is required", 409);
 const batch = await tx.uploadBatch.findUnique({ where: { id: batchId } });
 if (!batch || batch.status !== "PENDING" || batch.expiresAt <= new Date() || batch.requestedById !== actorId || (chapterId ? batch.chapterId !== chapterId : batch.workId !== workId)) throw new AppError("Upload batch is unavailable", 409);
 const objects = await tx.uploadObject.findMany({ where: { batchId } });
 if (objects.length !== assets.length || new Set(assets.map(a => a.pathname)).size !== assets.length || objects.some(o => o.status !== "UPLOADED" || !assets.some(a => a.pathname === o.pathname))) throw new AppError("Upload batch does not match uploaded assets", 409);
 if (assets.some(asset => !Number.isSafeInteger(asset.size) || asset.size <= 0)) throw new AppError("Invalid media size", 400);
 if (assets.length) await tx.mediaAsset.createMany({ data: assets.map(asset => ({ id: asset.id, url: asset.url, pathname: asset.pathname, contentType: asset.contentType, sizeBytes: BigInt(asset.size), createdById: actorId })) });
 for (const asset of assets) {
  await tx.uploadObject.update({ where: { pathname: asset.pathname }, data: { assetId: asset.id, status: "LINKED" } });
 }
 const committed = await tx.uploadBatch.updateMany({ where: { id: batchId, status: "PENDING", expiresAt: { gt: new Date() } }, data: { status: "COMMITTED" } });
 if (!committed.count) throw new AppError("Upload batch expired", 409);
}
export async function enqueueUnused(tx: Transaction, assetIds: string[]) {
 for (const id of [...new Set(assetIds)]) {
  const asset = await tx.mediaAsset.findUnique({ where: { id }, include: { _count: { select: { workCovers: true, incapBanners: true, pages: true, siteSettings: true } } } });
  if (!asset || Object.values(asset._count).some(count => count > 0)) continue;
  await tx.mediaAsset.update({ where: { id }, data: { status: "DELETING" } });
  if (!await tx.mediaCleanupJob.findFirst({ where: { assetId: id, status: { in: ["PENDING", "RUNNING", "FAILED"] } } })) await tx.mediaCleanupJob.create({ data: { assetId: id, pathname: asset.pathname } });
 }
}
export function persistenceError(error: unknown): unknown {
 if (typeof error === "object" && error !== null && "code" in error) {
  if (error.code === "P2002") return new AppError("Resource or media identifier already exists", 409);
  if (error.code === "P2003") return new AppError("Referenced resource does not exist", 400);
  if (error.code === "P2034") return new AppError("Concurrent modification; retry the operation", 409);
 }
 return error;
}
