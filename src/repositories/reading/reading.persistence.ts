import type { Prisma } from "../../generated/prisma/client";
import type { ReadingActor, ReadingPageInput } from "../../types/reading.types";
import AppError from "../../utils/AppError";
import { lockWork } from "../catalog/catalog.persistence";

export const visibleWork = { publicationStatus: "PUBLISHED", deletedAt: null } as const;
export const visibleChapter = { status: "PUBLISHED", deletedAt: null, work: visibleWork } as const;
export const summarySelect = { id: true, title: true, slug: true, coverAsset: { select: { url: true } }, coverThumbAsset: { select: { url: true } } } as const;
export function workSummary(work: { id: string; title: string; slug: string; coverAsset: { url: string } | null; coverThumbAsset?: { url: string } | null }) {
 // thumbUrl: small WebP for cards (null until media:thumbnails runs); coverUrl stays the original.
 return { id: work.id, title: work.title, slug: work.slug, coverUrl: work.coverAsset?.url ?? null, thumbUrl: work.coverThumbAsset?.url ?? null };
}
export function pagination(input: ReadingPageInput = {}) {
 return { skip: Math.max(0, Math.min(Math.trunc(input.skip ?? 0), 9999900)), take: Math.max(1, Math.min(Math.trunc(input.take ?? 20), 100)) };
}
export function localDay(time: Date, timezone: string) {
 const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
 return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export async function requireWork(tx: Prisma.TransactionClient, workId: string, lock = false) {
 if (lock) await lockWork(tx, workId);
 const work = await tx.work.findFirst({ where: { id: workId, ...visibleWork }, select: { id: true } });
 if (!work) throw new AppError("Work not found", 404);
}
export async function requireChapter(tx: Prisma.TransactionClient, chapterId: string) {
 const chapter = await tx.chapter.findUnique({ where: { id: chapterId }, select: { workId: true } });
 if (!chapter) throw new AppError("Chapter not found", 404);
 await requireWork(tx, chapter.workId, true);
 if (!await tx.chapter.findFirst({ where: { id: chapterId, ...visibleChapter }, select: { id: true } })) throw new AppError("Chapter not found", 404);
}
export async function requireActor(tx: Prisma.TransactionClient, actor: ReadingActor) {
 await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id}::uuid FOR UPDATE`;
 const user = await tx.user.findFirst({ where: { id: actor.id, status: "ACTIVE", deletedAt: null }, select: { id: true, timezone: true } });
 if (!user) throw new AppError("Authentication required", 401);
 return user;
}
export const stateSelect = { chapterId: true, isRead: true, firstReadAt: true, lastReadAt: true } as const;
export function conflict() { return new AppError("Idempotency key belongs to another request", 409); }
