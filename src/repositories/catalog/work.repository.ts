import prisma from "../../config/database/postgres";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { CatalogActor, CatalogListInput, WorkInput, WorkRepositoryContract, WorkSaveInput } from "../../types/catalog.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { lockUsers, readSqlTime } from "../user-locks";
import { authorize, canSeeDraft, guardPending, linkAssets, lockWork, persistenceError, workInclude } from "./catalog.persistence";
const logger = createLogger("WorkRepository");

export class WorkRepository implements WorkRepositoryContract {
 constructor(private readonly client: PrismaClient = prisma) {}
 async list(input: CatalogListInput = {}, actor?: CatalogActor) {
  try {
   let visibility: Prisma.WorkWhereInput = { publicationStatus: "PUBLISHED" };
   if (input.includeDrafts && actor) {
    const user = await this.client.user.findUnique({ where: { id: actor.id, status: "ACTIVE", deletedAt: null } });
    if (user?.role === "ADMIN") visibility = {};
    else if (user?.role === "EDITOR") visibility = { OR: [{ publicationStatus: "PUBLISHED" }, { editorAssignments: { some: { editorId: actor.id, revokedAt: null } } }] };
   }
   return await this.client.work.findMany({ where: { ...visibility, deletedAt: null, ...(input.typeId ? { typeId: input.typeId } : {}), ...(input.genreId ? { genres: { some: { genreId: input.genreId } } } : {}), ...(input.search ? { title: { contains: input.search, mode: "insensitive" } } : {}) }, include: workInclude, skip: input.skip ?? 0, take: Math.min(input.take ?? 20, 100), orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  } catch (error) { return catchAndLogError(logger, error, "Unable to list works"); }
 }
 async findById(id: string, actor?: CatalogActor) {
  try { return await this.client.work.findUnique({ where: { id, deletedAt: null, ...(await canSeeDraft(this.client, actor, id) ? {} : { publicationStatus: "PUBLISHED" }) }, include: workInclude }); }
  catch (error) { return catchAndLogError(logger, error, "Unable to find work"); }
 }
 async findForEdit(id: string, actor: CatalogActor) {
  try { return await this.client.$transaction(async tx => {
   await authorize(tx, actor, id);
   const work = await tx.work.findUnique({ where: { id, deletedAt: null }, include: workInclude });
   if (!work) throw new AppError("Work not found", 404);
   return work;
  }); } catch (error) { return catchAndLogError(logger, error, "Unable to authorize work"); }
 }
 async reserve(id: string, slug: string, input: WorkInput, actor: CatalogActor) {
  try { return await this.client.$transaction(async tx => {
   await lockUsers(tx, [actor.id]);
   await authorize(tx, actor);
   return tx.work.create({ data: { id, slug, title: input.title, synopsis: input.synopsis, typeId: input.typeId, createdById: actor.id, updatedById: actor.id, deletedAt: new Date(), publicationStatus: "DRAFT", releaseStatus: input.releaseStatus }, include: workInclude });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to reserve work"); }
 }
 async save(input: WorkSaveInput) {
  try { return await this.client.$transaction(async tx => {
   const { workId, actor, data } = input;
   await lockUsers(tx, [actor.id]); await lockWork(tx, workId); await authorize(tx, actor, input.creating ? undefined : workId); await guardPending(tx, workId, input.batchId);
   const current = await tx.work.findUnique({ where: { id: workId } });
   if (!current || (!input.creating && current.deletedAt) || (input.creating && (!current.deletedAt || current.createdById !== actor.id))) throw new AppError("Work not found", 404);
   if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new AppError("Work was modified; reload it", 409);
   const assets = input.assets ?? [];
   if (assets.some(a => a.fieldName !== "cover" && a.fieldName !== "banner" && a.fieldName !== "inpagecover") || new Set(assets.map(a => a.fieldName)).size !== assets.length) throw new AppError("Invalid work media fields", 400);
   await linkAssets(tx, actor.id, workId, undefined, assets, input.batchId);
   const cover = assets.find(a => a.fieldName === "cover"); const banner = assets.find(a => a.fieldName === "banner"); const incapBanner = assets.find(a => a.fieldName === "inpagecover");
   const coverAssetId = cover?.id ?? current.coverAssetId;
   const bannerAssetId = banner?.id ?? current.bannerAssetId;
   const incapBannerAssetId = incapBanner?.id ?? current.incapBannerAssetId;
   if ((data.publicationStatus ?? current.publicationStatus) === "PUBLISHED" && (!coverAssetId || (!current.legacyPublicationImagesExempt && (!bannerAssetId || !incapBannerAssetId)))) throw new AppError("A published work requires cover, banner and in-page cover", 400);
   if (data.genreIds !== undefined) { await tx.workGenre.deleteMany({ where: { workId } }); await tx.workGenre.createMany({ data: [...new Set(data.genreIds)].map(genreId => ({ workId, genreId })) }); }
   if (data.alternativeTitles !== undefined) { await tx.workAlternativeTitle.deleteMany({ where: { workId } }); await tx.workAlternativeTitle.createMany({ data: [...new Map(data.alternativeTitles.map(title => [title.trim().toLowerCase(), title.trim()])).entries()].map(([normalizedTitle, title]) => ({ workId, title, normalizedTitle })) }); }
   const { genreIds: _genres, alternativeTitles: _titles, ...fields } = data;
   // Always advance CAS even when the clock has not crossed a millisecond.
   const now = await readSqlTime(tx);
   await tx.work.update({ where: { id: workId }, data: { ...fields, updatedById: actor.id, updatedAt: new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1)), deletedAt: null, ...(cover ? { coverAssetId: cover.id } : {}), ...(banner ? { bannerAssetId: banner.id } : {}), ...(incapBanner ? { incapBannerAssetId: incapBanner.id } : {}), ...(data.publicationStatus === "PUBLISHED" && !current.publishedAt ? { publishedAt: now } : {}) } });
   return tx.work.findUniqueOrThrow({ where: { id: workId }, include: workInclude });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to save work"); }
 }
 async remove(id: string, actor: CatalogActor, expectedUpdatedAt: Date) {
  try { await this.client.$transaction(async tx => {
   await lockUsers(tx, [actor.id]); await lockWork(tx, id); await authorize(tx, actor, id); await guardPending(tx, id);
   const current = await tx.work.findUnique({ where: { id, deletedAt: null } });
   if (!current) throw new AppError("Work not found", 404);
   if (+current.updatedAt !== +expectedUpdatedAt) throw new AppError("Work was modified; reload it", 409);
   await tx.chapterPage.deleteMany({ where: { chapter: { workId: id } } });
   await tx.chapter.updateMany({ where: { workId: id, deletedAt: null }, data: { deletedAt: new Date(), status: "DRAFT", updatedById: actor.id, version: { increment: 1 } } });
   await tx.work.update({ where: { id }, data: { deletedAt: new Date(), publicationStatus: "DRAFT", coverAssetId: null, bannerAssetId: null, incapBannerAssetId: null, coverThumbAssetId: null, updatedById: actor.id } });
  }); } catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to remove work"); }
 }
 async abortReservation(id: string, actorId: string) {
  try { await this.client.$transaction(async tx => {
   await lockUsers(tx, [actorId]); await lockWork(tx, id);
   const now = await readSqlTime(tx);
   await tx.work.updateMany({ where: { id, createdById: actorId, deletedAt: { not: null }, publicationStatus: "DRAFT" }, data: { deletedAt: now } });
  }); }
  catch (error) { return catchAndLogError(logger, error, "Unable to abort work reservation"); }
 }
}
export const workRepository = new WorkRepository();
