import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import type { BeginBatchInput, CleanupJob, MediaRepositoryContract } from "../../types/catalog.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { authorize, guardPending, lockWork, persistenceError, type Transaction } from "./catalog.persistence";
const logger = createLogger("MediaRepository");

async function batchWork(tx: Transaction, batchId: string) {
 const batch = await tx.uploadBatch.findUnique({ where: { id: batchId }, include: { chapter: { select: { workId: true } } } });
 if (!batch) throw new AppError("Upload batch not found", 404);
 const workId = batch.workId ?? batch.chapter?.workId;
 if (!workId) throw new AppError("Upload batch has no destination", 409);
 await lockWork(tx, workId);
 return batch;
}
async function abandon(tx: Transaction, batchId: string) {
 await batchWork(tx, batchId);
 const changed = await tx.uploadBatch.updateMany({ where: { id: batchId, status: "PENDING" }, data: { status: "ABANDONED" } });
 if (!changed.count) return false;
 const objects = await tx.uploadObject.findMany({ where: { batchId, status: { in: ["PLANNED", "UPLOADED"] } } });
 // A request may have timed out while Blob is still accepting it. Wait beyond
 // the SDK's bounded upload timeout before deleting an ambiguously created path.
 for (const object of objects) await tx.mediaCleanupJob.create({ data: { pathname: object.pathname, assetId: object.assetId, nextAttemptAt: new Date(Date.now() + 15 * 60_000) } });
 return true;
}

export class MediaRepository implements MediaRepositoryContract {
 constructor(private readonly client: PrismaClient = prisma) {}
 async beginBatch(input: BeginBatchInput) {
  try { return await this.client.$transaction(async tx => {
   if (!!input.workId === !!input.chapterId) throw new AppError("Exactly one upload target is required", 400);
   let chapter = input.chapterId ? await tx.chapter.findUnique({ where: { id: input.chapterId } }) : null;
   const workId = input.workId ?? chapter?.workId;
   if (!workId) throw new AppError("Upload destination not found", 404);
   await lockWork(tx, workId);
   if (input.chapterId) chapter = await tx.chapter.findUnique({ where: { id: input.chapterId } });
   const work = await tx.work.findUnique({ where: { id: workId } });
   const user = await tx.user.findUnique({ where: { id: input.actorId, deletedAt: null, status: "ACTIVE" } });
   if (!user || !work) throw new AppError("Upload destination not found", 404);
   await authorize(tx, user, workId);
   // A hidden reservation belongs only to its creator; deleted real resources cannot be resurrected by uploads.
   if (work.deletedAt && !(work.createdById === input.actorId && work.publicationStatus === "DRAFT" && !work.coverAssetId)) throw new AppError("Work not found", 404);
   if (chapter?.deletedAt && !(chapter.createdById === input.actorId && chapter.status === "DRAFT" && chapter.version === 1)) throw new AppError("Chapter not found", 404);
   await guardPending(tx, workId);
   return tx.uploadBatch.create({ data: { id: input.id, requestedById: input.actorId, workId: input.workId, chapterId: input.chapterId, expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000) }, select: { id: true } });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to begin upload batch"); }
 }
 async planObject(batchId: string, pathname: string) {
  try { return await this.client.$transaction(async tx => {
   await batchWork(tx, batchId);
   const batch = await tx.uploadBatch.findUnique({ where: { id: batchId } });
   if (!batch || batch.status !== "PENDING" || batch.expiresAt <= new Date()) throw new AppError("Upload batch is unavailable", 409);
   return tx.uploadObject.create({ data: { batchId, pathname }, select: { id: true } });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to plan media upload"); }
 }
 async markUploaded(batchId: string, pathname: string) {
  try { await this.client.$transaction(async tx => {
   await batchWork(tx, batchId);
   const changed = await tx.uploadObject.updateMany({ where: { batchId, pathname, status: "PLANNED", batch: { status: "PENDING", expiresAt: { gt: new Date() } } }, data: { status: "UPLOADED" } });
   if (!changed.count) throw new AppError("Upload batch is unavailable", 409);
  }); } catch (error) { return catchAndLogError(logger, error, "Unable to record media upload"); }
 }
 async abandonBatch(batchId: string) {
  try { await this.client.$transaction(tx => abandon(tx, batchId)); }
  catch (error) { return catchAndLogError(logger, error, "Unable to abandon upload batch"); }
 }
 async reconcileExpiredBatches(limit = 50) {
  try {
   const batches = await this.client.uploadBatch.findMany({ where: { status: "PENDING", expiresAt: { lte: new Date() } }, select: { id: true }, take: Math.min(limit, 100), orderBy: { expiresAt: "asc" } });
   let count = 0;
   for (const batch of batches) if (await this.client.$transaction(async tx => {
    await batchWork(tx, batch.id);
    const current = await tx.uploadBatch.findUnique({ where: { id: batch.id } });
    return current && current.expiresAt <= new Date() ? abandon(tx, batch.id) : false;
   })) count++;
   return count;
  } catch (error) { return catchAndLogError(logger, error, "Unable to reconcile expired uploads"); }
 }
 async claimCleanup(limit = 20): Promise<CleanupJob[]> {
  try { return await this.client.$transaction(async tx => {
   const candidates = await tx.mediaCleanupJob.findMany({ where: { OR: [{ status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: new Date() } }, { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }] }, take: Math.min(limit, 100), orderBy: { createdAt: "asc" } });
   const jobs: CleanupJob[] = [];
   for (const job of candidates) {
    const claimed = await tx.mediaCleanupJob.updateMany({ where: { id: job.id, status: job.status, updatedAt: job.updatedAt }, data: { status: "RUNNING", attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    const asset = await tx.mediaAsset.findUnique({ where: { pathname: job.pathname }, include: { _count: { select: { workCovers: true, incapBanners: true, pages: true, siteSettings: true } } } });
    // Cleanup never deletes an asset that has acquired a reference.
    if (asset && Object.values(asset._count).some(count => count > 0)) {
     await tx.mediaCleanupJob.update({ where: { id: job.id }, data: { status: "COMPLETED", lastErrorCode: "STILL_REFERENCED" } });
     continue;
    }
    if (asset) await tx.mediaAsset.update({ where: { id: asset.id }, data: { status: "DELETING" } });
    jobs.push({ id: job.id, assetId: job.assetId, pathname: job.pathname, attempts: job.attempts + 1 });
   }
   return jobs;
  }); } catch (error) { return catchAndLogError(logger, error, "Unable to claim media cleanup"); }
 }
 async completeCleanup(id: string) {
  try { await this.client.$transaction(async tx => {
   const job = await tx.mediaCleanupJob.findUnique({ where: { id } });
   if (!job || job.status !== "RUNNING") return;
   await tx.mediaCleanupJob.update({ where: { id }, data: { status: "COMPLETED", lastErrorCode: null } });
   await tx.uploadObject.updateMany({ where: { pathname: job.pathname }, data: { status: "CLEANED" } });
  }); } catch (error) { return catchAndLogError(logger, error, "Unable to complete media cleanup"); }
 }
 async failCleanup(id: string, code: string) {
  try { await this.client.mediaCleanupJob.updateMany({ where: { id, status: "RUNNING" }, data: { status: "FAILED", lastErrorCode: code.replace(/[^A-Z0-9_]/gi, "").slice(0, 80) || "BLOB_DELETE_FAILED", nextAttemptAt: new Date(Date.now() + 60_000) } }); }
  catch (error) { return catchAndLogError(logger, error, "Unable to record cleanup failure"); }
 }
}
export const mediaRepository = new MediaRepository();
