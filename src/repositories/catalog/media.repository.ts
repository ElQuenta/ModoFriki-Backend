import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import type { BeginBatchInput, ReplacedChapterAsset, MediaRepositoryContract } from "../../types/catalog.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { lockUsers, readSqlTime } from "../user-locks";
import { authorize, guardPending, lockWork, persistenceError, type Transaction } from "./catalog.persistence";
const logger = createLogger("MediaRepository");

async function batchWork(tx: Transaction, batchId: string, requirePermission = true) {
 const destination = await tx.uploadBatch.findUnique({ where: { id: batchId }, include: { chapter: { select: { workId: true } } } });
 if (!destination) throw new AppError("Upload batch not found", 404);
 const workId = destination.workId ?? destination.chapter?.workId;
 if (!workId) throw new AppError("Upload batch has no destination", 409);
 await lockUsers(tx, [destination.requestedById]);
 await lockWork(tx, workId);
 const batch = await tx.uploadBatch.findUnique({ where: { id: batchId }, include: { chapter: { select: { workId: true } } } });
 const currentWorkId = batch?.workId ?? batch?.chapter?.workId;
 if (!batch) throw new AppError("Upload batch not found", 404);
 if (batch.requestedById !== destination.requestedById || currentWorkId !== workId) throw new AppError("Upload destination changed; retry the operation", 409);
 if (requirePermission) await authorize(tx, { id: batch.requestedById }, workId);
 return { batch, workId, now: await readSqlTime(tx) };
}

export class MediaRepository implements MediaRepositoryContract {
 constructor(private readonly client: PrismaClient = prisma) {}
 async beginBatch(input: BeginBatchInput) {
  try { return await this.client.$transaction(async tx => {
   if (!!input.workId === !!input.chapterId) throw new AppError("Exactly one upload target is required", 400);
   let chapter = input.chapterId ? await tx.chapter.findUnique({ where: { id: input.chapterId } }) : null;
   const workId = input.workId ?? chapter?.workId;
   if (!workId) throw new AppError("Upload destination not found", 404);
   await lockUsers(tx, [input.actorId]);
   await lockWork(tx, workId);
   if (input.chapterId) chapter = await tx.chapter.findUnique({ where: { id: input.chapterId } });
   const work = await tx.work.findUnique({ where: { id: workId } });
   const user = await tx.user.findUnique({ where: { id: input.actorId, deletedAt: null, status: "ACTIVE" } });
   if (!user || !work) throw new AppError("Upload destination not found", 404);
   await authorize(tx, user, workId);
   if (work.deletedAt && !(work.createdById === input.actorId && work.publicationStatus === "DRAFT" && !work.coverAssetId)) throw new AppError("Work not found", 404);
   if (chapter?.deletedAt && !(chapter.createdById === input.actorId && chapter.status === "DRAFT" && chapter.version === 1)) throw new AppError("Chapter not found", 404);
   await guardPending(tx, workId);
   return tx.uploadBatch.create({ data: { id: input.id, requestedById: input.actorId, workId: input.workId, chapterId: input.chapterId, expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000) }, select: { id: true } });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to begin upload batch"); }
 }
 async planObject(batchId: string, pathname: string) {
  try { return await this.client.$transaction(async tx => {
   const { batch, now } = await batchWork(tx, batchId);
   if (batch.status !== "PENDING" || batch.expiresAt <= now) throw new AppError("Upload batch is unavailable", 409);
   return tx.uploadObject.create({ data: { batchId, pathname }, select: { id: true } });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to plan media upload"); }
 }
 async markUploaded(batchId: string, pathname: string) {
  try { await this.client.$transaction(async tx => {
   const { now } = await batchWork(tx, batchId);
   const changed = await tx.uploadObject.updateMany({ where: { batchId, pathname, status: "PLANNED", batch: { status: "PENDING", expiresAt: { gt: now } } }, data: { status: "UPLOADED" } });
   if (!changed.count) throw new AppError("Upload batch is unavailable", 409);
  }); } catch (error) { return catchAndLogError(logger, error, "Unable to record media upload"); }
 }
 async abandonBatch(batchId: string) {
  try { await this.client.$transaction(async tx => {
   await batchWork(tx, batchId, false);
   // Abandonment changes the journal only. All stored files are retained.
   await tx.uploadBatch.updateMany({ where: { id: batchId, status: "PENDING" }, data: { status: "ABANDONED" } });
  }); } catch (error) { return catchAndLogError(logger, error, "Unable to abandon upload batch"); }
 }
 async claimReplacedChapterAssets(chapterId: string, assetIds: string[]): Promise<ReplacedChapterAsset[]> {
  try {
   if (!assetIds.length) return [];
   return await this.client.$transaction(async tx => {
    // Only previous files from this chapter's committed batches, with no remaining references.
    const where = {
     id: { in: [...new Set(assetIds)] },
     uploadObjects: { some: { batch: { chapterId, status: "COMMITTED" as const } } },
     pages: { none: {} }, workCovers: { none: {} }, workBanners: { none: {} }, coverThumbs: { none: {} }, incapBanners: { none: {} }, siteSettings: { none: {} }
    };
    const assets = await tx.mediaAsset.findMany({ where, select: { id: true, pathname: true } });
    if (assets.length) await tx.mediaAsset.updateMany({ where: { ...where, id: { in: assets.map(asset => asset.id) } }, data: { status: "DELETING" } });
    return assets;
   });
  } catch (error) { return catchAndLogError(logger, error, "Unable to verify replaced chapter files"); }
 }
 async markChapterAssetRemoved(assetId: string): Promise<void> {
  try { await this.client.uploadObject.updateMany({ where: { assetId, status: "LINKED" }, data: { status: "CLEANED" } }); }
  catch (error) { return catchAndLogError(logger, error, "Unable to record replaced chapter file removal"); }
 }
}
export const mediaRepository = new MediaRepository();
