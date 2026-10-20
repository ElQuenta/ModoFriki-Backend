import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import type { ReadingActor, ReadingPageInput, ReadingRepositoryContract, ReadingStats } from "../../types/reading.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { conflict, localDay, pagination, requireActor, requireChapter, requireWork, stateSelect, summarySelect, visibleChapter, visibleWork, workSummary } from "./reading.persistence";

const logger = createLogger("ReadingRepository");

export class ReadingRepository implements ReadingRepositoryContract {
 constructor(private readonly client: PrismaClient = prisma) {}

 private async run<T>(message: string, action: () => Promise<T>): Promise<T> {
  try { logger.debug(message); return await action(); }
  catch (error) { return catchAndLogError(logger, error, message); }
 }

 async recordVisit(workId: string, idempotencyKey: string) {
  return this.run("Unable to register work visit", () => this.client.$transaction(async tx => {
   await requireWork(tx, workId, true);
   const existing = await tx.workVisitEvent.findUnique({ where: { idempotencyKey } });
   if (existing) { if (existing.workId !== workId) throw conflict(); return { counted: false, occurredAt: existing.occurredAt }; }
   const occurredAt = new Date();
   const created = await tx.workVisitEvent.createMany({ data: [{ workId, idempotencyKey, occurredAt }], skipDuplicates: true });
   const event = await tx.workVisitEvent.findUniqueOrThrow({ where: { idempotencyKey } });
   if (event.workId !== workId) throw conflict();
   // Same transaction as the event: a retried key never inserts, so it never increments.
   // Raw SQL so @updatedAt (the edit/delete concurrency token) is not bumped by a visit.
   if (created.count > 0) await tx.$executeRaw`UPDATE "Work" SET "visitsCount" = "visitsCount" + 1 WHERE "id" = ${workId}::uuid`;
   return { counted: created.count > 0, occurredAt: event.occurredAt };
  }));
 }

 async recordRead(chapterId: string, idempotencyKey: string, actor?: ReadingActor) {
  return this.run("Unable to register chapter read", () => this.client.$transaction(async tx => {
   // Serialize a UUID across all chapters/users before taking work/user locks.
   // Select an integer because PostgreSQL's advisory-lock return type is void.
   const lockKey = `chapter-read:${idempotencyKey.toLowerCase()}`;
   await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
   await requireChapter(tx, chapterId);
   const user = actor ? await requireActor(tx, actor) : null;
   const receipt = await tx.chapterReadReceipt.findUnique({ where: { idempotencyKey }, include: { event: true } });
   // Original event keys predate receipts and remain authoritative for legacy retries.
   const original = await tx.chapterReadEvent.findUnique({ where: { idempotencyKey } });
   const existing = receipt?.event ?? original;
   if (existing) {
    if (existing.chapterId !== chapterId || existing.userId !== (actor?.id ?? null) || (original && original.id !== existing.id)) throw conflict();
    return { counted: false, occurredAt: existing.occurredAt, ...(actor ? { isRead: (await tx.userChapterRead.findUnique({ where: { userId_chapterId: { userId: actor.id, chapterId } } }))?.isRead ?? false } : {}) };
   }
   const occurredAt = new Date();
   const localDate = user ? new Date(`${localDay(occurredAt, user.timezone)}T00:00:00.000Z`) : null;
   const created = await tx.chapterReadEvent.createMany({ data: [{ chapterId, idempotencyKey, occurredAt, userId: user?.id, localDate, timezoneAtEvent: user?.timezone }], skipDuplicates: true });
   const byKey = await tx.chapterReadEvent.findUnique({ where: { idempotencyKey } });
   if (byKey && (byKey.chapterId !== chapterId || byKey.userId !== (user?.id ?? null))) throw conflict();
   const event = byKey ?? (user ? await tx.chapterReadEvent.findFirst({ where: { userId: user.id, chapterId, localDate } }) : null);
   if (!event) throw new AppError("Unable to register chapter read", 500);
   // Save aliases even when the canonical event already exists for this local day.
   // Any failure rolls back both the event and the read state in this transaction.
   await tx.chapterReadReceipt.create({ data: { idempotencyKey, eventId: event.id } });
   if (user) await tx.userChapterRead.upsert({ where: { userId_chapterId: { userId: user.id, chapterId } }, create: { userId: user.id, chapterId, firstReadAt: occurredAt, lastReadAt: occurredAt }, update: { isRead: true, lastReadAt: occurredAt } });
   return { counted: created.count > 0, occurredAt: event.occurredAt, ...(user ? { isRead: true } : {}) };
  }));
 }

 async setReadState(chapterId: string, isRead: boolean, actor: ReadingActor) {
  return this.run("Unable to update chapter read state", () => this.client.$transaction(async tx => {
   if (isRead) await requireChapter(tx, chapterId);
   await requireActor(tx, actor);
   const where = { userId_chapterId: { userId: actor.id, chapterId } };
   if (!isRead) {
    const existing = await tx.userChapterRead.findUnique({ where, select: stateSelect });
    return existing ? tx.userChapterRead.update({ where, data: { isRead: false }, select: stateSelect }) : null;
   }
   const now = new Date();
   // These timestamps record this operation, never a user supplied historical date.
   return tx.userChapterRead.upsert({ where, create: { userId: actor.id, chapterId, firstReadAt: now, lastReadAt: now }, update: { isRead: true }, select: stateSelect });
  }));
 }

 async setFavorite(workId: string, enabled: boolean, actor: ReadingActor) {
  return this.run("Unable to update favorite", () => this.client.$transaction(async tx => {
   if (enabled) await requireWork(tx, workId, true);
   await requireActor(tx, actor);
   if (enabled) await tx.favorite.upsert({ where: { userId_workId: { userId: actor.id, workId } }, create: { userId: actor.id, workId }, update: {} });
   else await tx.favorite.deleteMany({ where: { userId: actor.id, workId } });
   return { workId, isFavorite: enabled };
  }));
 }

 async setRating(workId: string, scoreHalfStars: number | null, actor: ReadingActor) {
  if (scoreHalfStars !== null && (!Number.isInteger(scoreHalfStars) || scoreHalfStars < 0 || scoreHalfStars > 10)) throw new AppError("Invalid rating", 400);
  return this.run("Unable to update work rating", () => this.client.$transaction(async tx => {
   if (scoreHalfStars !== null) await requireWork(tx, workId, true);
   await requireActor(tx, actor);
   if (scoreHalfStars === null) await tx.workRating.deleteMany({ where: { userId: actor.id, workId } });
   else await tx.workRating.upsert({ where: { userId_workId: { userId: actor.id, workId } }, create: { userId: actor.id, workId, scoreHalfStars }, update: { scoreHalfStars } });
   return { workId, scoreHalfStars };
  }));
 }

 async listFavorites(actor: ReadingActor, input: ReadingPageInput = {}) {
  return this.run("Unable to list favorites", () => this.client.$transaction(async tx => {
   const page = pagination(input); const where = { userId: actor.id, work: visibleWork };
   const total = await tx.favorite.count({ where });
   const rows = await tx.favorite.findMany({ where, ...page, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true, work: { select: summarySelect } } });
   return { ...page, total, items: rows.map(row => ({ createdAt: row.createdAt, work: workSummary(row.work) })) };
  }, { isolationLevel: "RepeatableRead" }));
 }

 async listHistory(actor: ReadingActor, input: ReadingPageInput = {}) {
  return this.run("Unable to list reading history", () => this.client.$transaction(async tx => {
   const page = pagination(input); const where = { userId: actor.id, isRead: true, chapter: visibleChapter };
   const total = await tx.userChapterRead.count({ where });
   const rows = await tx.userChapterRead.findMany({ where, ...page, orderBy: [{ lastReadAt: "desc" }, { id: "desc" }], select: { ...stateSelect, chapter: { select: { id: true, number: true, title: true, work: { select: summarySelect } } } } });
   return { ...page, total, items: rows.map(({ chapter, ...state }) => ({ ...state, chapter: { id: chapter.id, number: chapter.number.toString(), title: chapter.title }, work: workSummary(chapter.work) })) };
  }, { isolationLevel: "RepeatableRead" }));
 }

 async getWorkState(workId: string, actor: ReadingActor, input: ReadingPageInput = {}) {
  return this.run("Unable to retrieve reading progress", () => this.client.$transaction(async tx => {
   await requireWork(tx, workId);
   const page = pagination(input); const where = { workId, ...visibleChapter };
   const favorite = await tx.favorite.findUnique({ where: { userId_workId: { userId: actor.id, workId } }, select: { id: true } });
   const rating = await tx.workRating.findUnique({ where: { userId_workId: { userId: actor.id, workId } }, select: { scoreHalfStars: true } });
   const totalChapters = await tx.chapter.count({ where });
   const readChapters = await tx.userChapterRead.count({ where: { userId: actor.id, isRead: true, chapter: where } });
   const rows = await tx.chapter.findMany({ where, ...page, orderBy: [{ number: "asc" }, { id: "asc" }], select: { id: true, number: true, title: true, readStates: { where: { userId: actor.id }, select: stateSelect } } });
   return { workId, isFavorite: !!favorite, scoreHalfStars: rating?.scoreHalfStars ?? null, totalChapters, readChapters, chapters: { ...page, total: totalChapters, items: rows.map(chapter => ({ chapterId: chapter.id, number: chapter.number.toString(), title: chapter.title, isRead: chapter.readStates[0]?.isRead ?? false, firstReadAt: chapter.readStates[0]?.firstReadAt ?? null, lastReadAt: chapter.readStates[0]?.lastReadAt ?? null })) } };
  }, { isolationLevel: "RepeatableRead" }));
 }

 async getCalendar(actor: ReadingActor, from: string, to: string) {
  return this.run("Unable to retrieve reading calendar", async () => {
   const start = new Date(`${from}T00:00:00.000Z`); const end = new Date(`${to}T00:00:00.000Z`);
   if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start || +end - +start > 365 * 86400000) throw new AppError("Invalid calendar range; maximum 366 days", 400);
   const rows = await this.client.chapterReadEvent.groupBy({ by: ["localDate"], where: { userId: actor.id, localDate: { gte: start, lte: end } }, _count: { _all: true }, orderBy: { localDate: "asc" } });
   return rows.map(row => ({ date: row.localDate!.toISOString().slice(0, 10), chaptersRead: row._count._all }));
  });
 }

 async getStats(actor: ReadingActor): Promise<ReadingStats> {
  return this.run("Unable to retrieve reading statistics", () => this.client.$transaction(async tx => {
   const today = localDay(new Date(), actor.timezone);
   // Aggregate dates in PostgreSQL; neither events nor the complete date series leave the database.
   const [activity] = await tx.$queryRaw<Array<{ recordedReads: number; activeDays: number; readsToday: number; readsLast7Days: number; readsLast30Days: number; currentStreak: number; longestStreak: number; lastReadingDate: string | null }>>`
    WITH days AS (
     SELECT "localDate" AS day, COUNT(*)::int AS reads FROM "ChapterReadEvent"
     WHERE "userId" = ${actor.id}::uuid GROUP BY "localDate"
    ), numbered AS (
     SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS island FROM days
    ), streaks AS (
     SELECT MIN(day) AS start, MAX(day) AS finish, COUNT(*)::int AS length FROM numbered GROUP BY island
    )
    SELECT COALESCE(SUM(reads),0)::int AS "recordedReads", COUNT(*)::int AS "activeDays",
     COALESCE(SUM(reads) FILTER (WHERE day = ${today}::date),0)::int AS "readsToday",
     COALESCE(SUM(reads) FILTER (WHERE day BETWEEN ${today}::date - 6 AND ${today}::date),0)::int AS "readsLast7Days",
     COALESCE(SUM(reads) FILTER (WHERE day BETWEEN ${today}::date - 29 AND ${today}::date),0)::int AS "readsLast30Days",
     COALESCE((SELECT length FROM streaks WHERE finish BETWEEN ${today}::date - 1 AND ${today}::date ORDER BY finish DESC LIMIT 1),0)::int AS "currentStreak",
     COALESCE((SELECT MAX(length) FROM streaks),0)::int AS "longestStreak", TO_CHAR(MAX(day),'YYYY-MM-DD') AS "lastReadingDate" FROM days`;
   const markedReadChapters = await tx.userChapterRead.count({ where: { userId: actor.id, isRead: true, chapter: visibleChapter } });
   const favorites = await tx.favorite.count({ where: { userId: actor.id, work: visibleWork } });
   return { ...activity, markedReadChapters, favorites, timezone: actor.timezone };
  }, { isolationLevel: "RepeatableRead" }));
 }

 async getWorkStats(workId: string) {
  return this.run("Unable to retrieve work statistics", () => this.client.$transaction(async tx => {
   await requireWork(tx, workId);
   const since = new Date(Date.now() - 86400000);
   const { visitsCount: visits } = await tx.work.findUniqueOrThrow({ where: { id: workId }, select: { visitsCount: true } });
   const visitsLast24Hours = await tx.workVisitEvent.count({ where: { workId, occurredAt: { gte: since } } });
   // Historical totals survive chapter unpublication/deletion; only the work is public.
   const chapter = { workId };
   const reads = await tx.chapterReadEvent.count({ where: { chapter } });
   const readsLast24Hours = await tx.chapterReadEvent.count({ where: { chapter, occurredAt: { gte: since } } });
   const favorites = await tx.favorite.count({ where: { workId } });
   const rating = await tx.workRating.aggregate({ where: { workId }, _count: { _all: true }, _avg: { scoreHalfStars: true } });
   return { workId, visits, visitsLast24Hours, reads, readsLast24Hours, favorites, ratings: rating._count._all, averageRating: rating._avg.scoreHalfStars === null ? null : rating._avg.scoreHalfStars / 2 };
  }, { isolationLevel: "RepeatableRead" }));
 }
}

export const readingRepository = new ReadingRepository();
