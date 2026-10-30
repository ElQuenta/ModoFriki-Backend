import prisma from "../../config/database/postgres";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { AdminActor, CursorPageRecord } from "../../types/admin.types";
import type { ImposeSanctionInput, SanctionRecord, SanctionRepositoryContract, SanctionHistoryRecord, ValidatedSanctionEvidence } from "../../types/sanctions.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { ADMIN_TRANSACTION_OPTIONS, lockUsers, readSqlTime } from "../user-locks";

const logger = createLogger("CommentSanctionRepository");
const select = { id: true, userId: true, reason: true, startsAt: true, endsAt: true, imposedById: true,
	revokedAt: true, revokedById: true, closedAt: true, evidenceType: true, evidenceId: true } satisfies Prisma.CommentSanctionSelect;

function map(row: Prisma.CommentSanctionGetPayload<{ select: typeof select }>): SanctionRecord {
	const { evidenceType, evidenceId, ...record } = row;
	return { ...record, evidence: evidenceType && evidenceId ? { type: evidenceType as "COMMENT" | "REPORT", id: evidenceId } : null } as SanctionRecord;
}
function failure(error: unknown): unknown {
	if (error instanceof AppError) return error;
	if (typeof error === "object" && error !== null && "code" in error && (error.code === "P2002" || error.code === "P2034")) return new AppError("Comment sanction changed; retry", 409);
	return new AppError("Comment sanction persistence unavailable", 503);
}

export class CommentSanctionRepository implements SanctionRepositoryContract {
	constructor(private readonly client: PrismaClient = prisma) {}
	private async requireActor(tx: Prisma.TransactionClient, actor: AdminActor) {
		const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, status: true, deletedAt: true } });
		if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE" || user.deletedAt) throw new AppError("Insufficient permissions", 403);
	}
	private async requireSubject(tx: Prisma.TransactionClient, userId: string) {
		const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true, deletedAt: true } });
		if (!user || user.status === "DELETED" || user.deletedAt) throw new AppError("User not found", 404);
		if (user.role === "ADMIN") throw new AppError("Protected administrator", 403);
		return user;
	}
	private async closeExpired(tx: Prisma.TransactionClient, userId: string, now: Date) {
		await tx.$executeRaw`UPDATE "CommentSanction" SET "closedAt" = "endsAt" WHERE "userId" = ${userId}::uuid AND "closedAt" IS NULL AND "revokedAt" IS NULL AND "endsAt" IS NOT NULL AND "endsAt" <= ${now}`;
	}
	async list(actor: AdminActor, userId: string, input: { limit?: number; cursor?: { createdAt: Date; id: string } }): Promise<SanctionHistoryRecord> {
		try { return await this.client.$transaction(async tx => {
			await lockUsers(tx, [actor.id, userId]); await this.requireActor(tx, actor); await this.requireSubject(tx, userId);
			const now = await readSqlTime(tx); await this.closeExpired(tx, userId, now); const limit = Math.min(input.limit ?? 20, 100);
			const rows = await tx.commentSanction.findMany({ where: { userId, ...(input.cursor ? { OR: [{ startsAt: { lt: input.cursor.createdAt } }, { startsAt: input.cursor.createdAt, id: { lt: input.cursor.id } }] } : {}) }, select, orderBy: [{ startsAt: "desc" }, { id: "desc" }], take: limit + 1 });
			const hasMore = rows.length > limit, items = rows.slice(0, limit).map(map), tail = items.at(-1);
			const history: CursorPageRecord<SanctionRecord> = { items, hasMore, nextCursor: hasMore && tail ? { createdAt: tail.startsAt, id: tail.id } : null };
			const currentRow = await tx.commentSanction.findFirst({ where: { userId, closedAt: null, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select });
			return { now, current: currentRow ? map(currentRow) : null, history };
		}, ADMIN_TRANSACTION_OPTIONS); } catch (error) { return catchAndLogError(logger, failure(error), "Unable to list comment sanctions"); }
	}
	async findCurrent(userId: string) {
		try { return await this.client.$transaction(async tx => { await lockUsers(tx, [userId]); const now = await readSqlTime(tx); await this.closeExpired(tx, userId, now); const row = await tx.commentSanction.findFirst({ where: { userId, closedAt: null, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select }); return { now, current: row ? map(row) : null }; }, ADMIN_TRANSACTION_OPTIONS); }
		catch (error) { return catchAndLogError(logger, failure(error), "Unable to read comment restriction"); }
	}
	async impose(actor: AdminActor, userId: string, input: ImposeSanctionInput, evidence: ValidatedSanctionEvidence | null): Promise<SanctionRecord> {
		try { return await this.client.$transaction(async tx => {
			await lockUsers(tx, [actor.id, userId]); await this.requireActor(tx, actor); await this.requireSubject(tx, userId);
			if (evidence && evidence.authorId !== userId) throw new AppError("Evidence does not belong to the user", 400);
			const reason = input.reason.trim(); if (!reason || reason.length > 2000) throw new AppError("Invalid sanction reason", 400);
			const now = await readSqlTime(tx); await this.closeExpired(tx, userId, now);
			if (input.endsAt && input.endsAt <= now) throw new AppError("Sanction end must be in the future", 400);
			if (await tx.commentSanction.findFirst({ where: { userId, closedAt: null } })) throw new AppError("User already has an active comment sanction", 409);
			const row = await tx.commentSanction.create({ data: { userId, imposedById: actor.id, reason, startsAt: now, endsAt: input.endsAt,
				...(evidence ? { evidenceType: evidence.reference.type, evidenceId: evidence.reference.id } : {}) }, select });
			await tx.commentCreationDecision.updateMany({ where: { authorId: userId, state: "PREPARED" }, data: { state: "REJECTED", decidedAt: now, rejectionCode: "SANCTIONED" } });
			await tx.adminAuditEvent.create({ data: { actorId: actor.id, subjectUserId: userId, sanctionId: row.id, action: "COMMENT_SANCTION_IMPOSED", occurredAt: now } });
			return map(row);
		}, ADMIN_TRANSACTION_OPTIONS); } catch (error) { return catchAndLogError(logger, failure(error), "Unable to impose comment sanction"); }
	}
	async revoke(actor: AdminActor, userId: string, sanctionId: string): Promise<SanctionRecord> {
		try { return await this.client.$transaction(async tx => {
			await lockUsers(tx, [actor.id, userId]); await this.requireActor(tx, actor); await this.requireSubject(tx, userId);
			const now = await readSqlTime(tx); await this.closeExpired(tx, userId, now);
			const current = await tx.commentSanction.findFirst({ where: { id: sanctionId, userId }, select }); if (!current) throw new AppError("Comment sanction not found", 404);
			if (current.closedAt) return map(current);
			const row = await tx.commentSanction.update({ where: { id: sanctionId }, data: { revokedAt: now, revokedById: actor.id, closedAt: now }, select });
			await tx.adminAuditEvent.create({ data: { actorId: actor.id, subjectUserId: userId, sanctionId, action: "COMMENT_SANCTION_REVOKED", occurredAt: now } });
			return map(row);
		}, ADMIN_TRANSACTION_OPTIONS); } catch (error) { return catchAndLogError(logger, failure(error), "Unable to revoke comment sanction"); }
	}
}
export const commentSanctionRepository = new CommentSanctionRepository();
