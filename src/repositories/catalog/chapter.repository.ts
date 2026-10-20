import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import type { CatalogActor, CatalogListInput, ChapterInput, ChapterRepositoryContract, ChapterSaveInput } from "../../types/catalog.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { authorize, canSeeDraft, chapterInclude, guardPending, linkAssets, lockWork, persistenceError } from "./catalog.persistence";
const logger = createLogger("ChapterRepository");
export class ChapterRepository implements ChapterRepositoryContract {
 constructor(private readonly client: PrismaClient = prisma) {}
 async list(workId: string, input: CatalogListInput = {}, actor?: CatalogActor) {
  try {
   const drafts = input.includeDrafts && await canSeeDraft(this.client, actor, workId);
   return await this.client.chapter.findMany({ where: { workId, deletedAt: null, work: { deletedAt: null, ...(drafts ? {} : { publicationStatus: "PUBLISHED" }) }, ...(drafts ? {} : { status: "PUBLISHED" }) }, include: chapterInclude, orderBy: { number: "asc" }, skip: input.skip ?? 0, take: Math.min(input.take ?? 20, 100) });
  } catch (error) { return catchAndLogError(logger, error, "Unable to list chapters"); }
 }
 async findById(workId: string, id: string, actor?: CatalogActor) {
  try {
   const drafts = await canSeeDraft(this.client, actor, workId);
   return await this.client.chapter.findUnique({ where: { id, workId, deletedAt: null, work: { deletedAt: null, ...(drafts ? {} : { publicationStatus: "PUBLISHED" }) }, ...(drafts ? {} : { status: "PUBLISHED" }) }, include: chapterInclude });
  } catch (error) { return catchAndLogError(logger, error, "Unable to find chapter"); }
 }
 async findForEdit(workId: string, id: string, actor: CatalogActor) {
  try { return await this.client.$transaction(async tx => {
   await authorize(tx, actor, workId);
   const chapter = await tx.chapter.findUnique({ where: { id, workId, deletedAt: null, work: { deletedAt: null } }, include: chapterInclude });
   if (!chapter) throw new AppError("Chapter not found", 404);
   return chapter;
  }); } catch (error) { return catchAndLogError(logger, error, "Unable to authorize chapter"); }
 }
 async reserve(id: string, workId: string, input: ChapterInput, actor: CatalogActor) {
  try { return await this.client.$transaction(async tx => {
   await lockWork(tx, workId); await authorize(tx, actor, workId); await guardPending(tx, workId);
   if (!await tx.work.findUnique({ where: { id: workId, deletedAt: null } })) throw new AppError("Work not found", 404);
   const previous = await tx.chapter.findUnique({ where: { workId_number: { workId, number: input.number } }, include: { _count: { select: { pages: true } } } });
   // Failed creations keep their journal FKs. Reuse only this actor's untouched
   // hidden reservation; genuinely deleted chapters have version >= 2.
   if (previous) {
    if (!previous.deletedAt || previous.version !== 1 || previous.status !== "DRAFT" || previous.createdById !== actor.id || previous._count.pages) throw new AppError("Chapter number already exists", 409);
    return tx.chapter.update({ where: { id: previous.id }, data: { title: input.title, kind: input.kind, updatedById: actor.id }, include: chapterInclude });
   }
   // All reservations serialize on parent row; prefix collisions cannot pass concurrently.
   const siblings = await tx.chapter.findMany({ where: { workId }, select: { id: true } });
   if (siblings.some(chapter => chapter.id.slice(0, 4) === id.slice(0, 4))) throw new AppError("Chapter folder identifier collision; retry", 409);
   return tx.chapter.create({ data: { id, workId, number: input.number, title: input.title, kind: input.kind, status: "DRAFT", createdById: actor.id, updatedById: actor.id, deletedAt: new Date() }, include: chapterInclude });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to reserve chapter"); }
 }
 async save(input: ChapterSaveInput) {
  try { return await this.client.$transaction(async tx => {
   const { actor, workId, chapterId, data } = input;
   await lockWork(tx, workId); await authorize(tx, actor, workId); await guardPending(tx, workId, input.batchId);
   const parent = await tx.work.findUnique({ where: { id: workId, deletedAt: null } });
   if (!parent) throw new AppError("Work not found", 404);
   const current = await tx.chapter.findUnique({ where: { id: chapterId, workId }, include: chapterInclude });
   if (!current || (!input.creating && current.deletedAt) || (input.creating && (!current.deletedAt || current.createdById !== actor.id))) throw new AppError("Chapter not found", 404);
   if (current.version !== input.expectedVersion) throw new AppError("Chapter was modified; reload it", 409);
   if ((data.status ?? current.status) === "PUBLISHED" && parent.publicationStatus !== "PUBLISHED") throw new AppError("Publish the work before publishing its chapters", 400);
   if (input.pages && (!input.pages.length || input.pages.some((page, index) => page.position !== index + 1))) throw new AppError("Pages must be contiguous and ordered from one", 400);
   await linkAssets(tx, actor.id, workId, chapterId, input.pages ?? [], input.batchId);
   if ((data.status ?? current.status) === "PUBLISHED" && !(input.pages?.length ?? current.pages.length)) throw new AppError("Published chapters require pages", 400);
   if (input.pages) {
    await tx.chapterPage.deleteMany({ where: { chapterId } });
    await tx.chapterPage.createMany({ data: input.pages.map(page => ({ chapterId, assetId: page.id, position: page.position! })) });
   }
   await tx.chapter.update({ where: { id: chapterId }, data: { ...data, deletedAt: null, version: { increment: 1 }, updatedById: actor.id, ...(data.status === "PUBLISHED" && !current.publishedAt ? { publishedAt: new Date() } : {}) } });
   return tx.chapter.findUniqueOrThrow({ where: { id: chapterId }, include: chapterInclude });
  }, { timeout: 30_000 }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to save chapter"); }
 }
 async remove(workId: string, id: string, actor: CatalogActor, expectedVersion: number) {
  try { await this.client.$transaction(async tx => {
   await lockWork(tx, workId); await authorize(tx, actor, workId); await guardPending(tx, workId);
   const current = await tx.chapter.findUnique({ where: { id, workId, deletedAt: null, work: { deletedAt: null } }, include: chapterInclude });
   if (!current) throw new AppError("Chapter not found", 404);
   if (current.version !== expectedVersion) throw new AppError("Chapter was modified; reload it", 409);
   await tx.chapterPage.deleteMany({ where: { chapterId: id } });
   await tx.chapter.update({ where: { id }, data: { deletedAt: new Date(), status: "DRAFT", version: { increment: 1 }, updatedById: actor.id } });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to remove chapter"); }
 }
 async abortReservation(id: string, actorId: string) {
  try { await this.client.chapter.updateMany({ where: { id, createdById: actorId, deletedAt: { not: null }, status: "DRAFT" }, data: { deletedAt: new Date() } }); }
  catch (error) { return catchAndLogError(logger, error, "Unable to abort chapter reservation"); }
 }
}
export const chapterRepository = new ChapterRepository();
