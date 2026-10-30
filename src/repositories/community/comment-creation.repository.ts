import prisma from "../../config/database/postgres";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { CommentCreationActor, CommentCreationDecision, CommentCreationRepositoryContract, CommentDecisionVisibility, PrepareCommentInput, StagedCommentTarget } from "../../types/comment-creation.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { lockWork } from "../catalog/catalog.persistence";
import { ADMIN_TRANSACTION_OPTIONS, lockUsers, readSqlTime } from "../user-locks";

const logger = createLogger("CommentCreationRepository");
const select = { id: true, authorId: true, state: true, requestFingerprint: true, preparedAt: true, expiresAt: true, decidedAt: true, rejectionCode: true } satisfies Prisma.CommentCreationDecisionSelect;
type Row = Prisma.CommentCreationDecisionGetPayload<{ select: typeof select }>;
const fingerprintPattern = /^[0-9a-f]{64}$/;
function map(row: Row): CommentCreationDecision { return row as CommentCreationDecision; }
function failure(error: unknown): unknown {
	if (error instanceof AppError) return error;
	if (typeof error === "object" && error !== null && "code" in error && (error.code === "P2002" || error.code === "P2034")) return new AppError("Comment operation changed; retry", 409);
	return new AppError("Comment decision persistence unavailable", 503);
}

export class CommentCreationRepository implements CommentCreationRepositoryContract {
	constructor(private readonly client: PrismaClient = prisma) {}
	private verify(existing: Row, actor: CommentCreationActor, input: PrepareCommentInput) {
		if (existing.authorId !== actor.id || existing.requestFingerprint !== input.requestFingerprint) throw new AppError("Idempotency key was used for another request", 409);
	}
	private async closeExpiredSanction(tx: Prisma.TransactionClient, userId: string, now: Date) {
		const expired = await tx.commentSanction.findMany({ where: { userId, closedAt: null, revokedAt: null, endsAt: { not: null, lte: now } }, select: { id: true, endsAt: true } });
		for (const row of expired) if (row.endsAt) await tx.commentSanction.updateMany({ where: { id: row.id, closedAt: null }, data: { closedAt: row.endsAt } });
	}
	private async reject(tx: Prisma.TransactionClient, id: string, now: Date, rejectionCode: "SANCTIONED" | "ACCOUNT_UNAVAILABLE" | "EXPIRED" | "TARGET_UNAVAILABLE") {
		await tx.commentCreationDecision.updateMany({ where: { id, state: "PREPARED" }, data: { state: "REJECTED", decidedAt: now, rejectionCode } });
		return tx.commentCreationDecision.findUniqueOrThrow({ where: { id }, select });
	}
	async prepare(actor: CommentCreationActor, input: PrepareCommentInput): Promise<CommentCreationDecision> {
		try { return await this.client.$transaction(async tx => {
			if (!fingerprintPattern.test(input.requestFingerprint)) throw new AppError("Invalid request fingerprint", 400);
			await lockUsers(tx, [actor.id]); const now = await readSqlTime(tx);
			const existing = await tx.commentCreationDecision.findUnique({ where: { id: input.operationId }, select });
			if (existing) { this.verify(existing, actor, input); if (existing.state === "PREPARED" && existing.expiresAt <= now) return map(await this.reject(tx, existing.id, now, "EXPIRED")); return map(existing); }
			const account = await tx.user.findUnique({ where: { id: actor.id }, select: { status: true, deletedAt: true } });
			if (!account) throw new AppError("Account unavailable", 403);
			await this.closeExpiredSanction(tx, actor.id, now);
			const sanctioned = !!await tx.commentSanction.findFirst({ where: { userId: actor.id, closedAt: null, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true } });
			const rejectionCode = account.status !== "ACTIVE" || account.deletedAt ? "ACCOUNT_UNAVAILABLE" : sanctioned ? "SANCTIONED" : null;
			const expiresAt = new Date(now.getTime() + 60_000);
			const row = await tx.commentCreationDecision.create({ data: { id: input.operationId, authorId: actor.id, requestFingerprint: input.requestFingerprint, preparedAt: now, expiresAt,
				...(rejectionCode ? { state: "REJECTED", decidedAt: now, rejectionCode } : { state: "PREPARED" }) }, select });
			return map(row);
		}, ADMIN_TRANSACTION_OPTIONS); } catch (error) { return catchAndLogError(logger, failure(error), "Unable to prepare comment creation"); }
	}
	async finalize(actor: CommentCreationActor, operationId: string, stagedTarget: StagedCommentTarget): Promise<CommentCreationDecision> {
		try { return await this.client.$transaction(async tx => {
			await lockUsers(tx, [actor.id]); await lockWork(tx, stagedTarget.workId); const now = await readSqlTime(tx);
			const current = await tx.commentCreationDecision.findUnique({ where: { id: operationId }, select });
			if (!current || current.authorId !== actor.id) throw new AppError("Comment operation not found", 404);
			if (current.state !== "PREPARED") return map(current);
			if (current.expiresAt <= now) return map(await this.reject(tx, operationId, now, "EXPIRED"));
			const account = await tx.user.findUnique({ where: { id: actor.id }, select: { status: true, deletedAt: true } });
			if (!account || account.status !== "ACTIVE" || account.deletedAt) return map(await this.reject(tx, operationId, now, "ACCOUNT_UNAVAILABLE"));
			await this.closeExpiredSanction(tx, actor.id, now);
			if (await tx.commentSanction.findFirst({ where: { userId: actor.id, closedAt: null, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true } })) return map(await this.reject(tx, operationId, now, "SANCTIONED"));
			let targetAvailable = false;
			if (stagedTarget.targetType === "WORK" && stagedTarget.targetId === stagedTarget.workId) {
				targetAvailable = !!await tx.work.findFirst({ where: { id: stagedTarget.workId, publicationStatus: "PUBLISHED", deletedAt: null }, select: { id: true } });
			} else if (stagedTarget.targetType === "CHAPTER") {
				targetAvailable = !!await tx.chapter.findFirst({ where: { id: stagedTarget.targetId, workId: stagedTarget.workId, status: "PUBLISHED", deletedAt: null, work: { publicationStatus: "PUBLISHED", deletedAt: null } }, select: { id: true } });
			}
			if (!targetAvailable) return map(await this.reject(tx, operationId, now, "TARGET_UNAVAILABLE"));
			const changed = await tx.commentCreationDecision.updateMany({ where: { id: operationId, state: "PREPARED", expiresAt: { gt: now } }, data: { state: "COMMITTED", decidedAt: now, rejectionCode: null } });
			if (!changed.count) return map(await tx.commentCreationDecision.findUniqueOrThrow({ where: { id: operationId }, select }));
			return map(await tx.commentCreationDecision.findUniqueOrThrow({ where: { id: operationId }, select }));
		}, ADMIN_TRANSACTION_OPTIONS); } catch (error) { return catchAndLogError(logger, failure(error), "Unable to finalize comment creation"); }
	}
	async findDecisions(ids: string[]): Promise<CommentDecisionVisibility[]> {
		try { if (!ids.length) return []; return await this.client.commentCreationDecision.findMany({ where: { id: { in: [...new Set(ids)].slice(0, 101) } }, select: { id: true, authorId: true, state: true } }); }
		catch (error) { return catchAndLogError(logger, failure(error), "Unable to read comment decisions"); }
	}
	async resolve(actor: CommentCreationActor, input: PrepareCommentInput): Promise<CommentCreationDecision | null> {
		try { return await this.client.$transaction(async tx => { await lockUsers(tx, [actor.id]); const now = await readSqlTime(tx); const current = await tx.commentCreationDecision.findUnique({ where: { id: input.operationId }, select }); if (!current) return null; this.verify(current, actor, input); if (current.state === "PREPARED" && current.expiresAt <= now) return map(await this.reject(tx, current.id, now, "EXPIRED")); return map(current); }, ADMIN_TRANSACTION_OPTIONS); }
		catch (error) { return catchAndLogError(logger, failure(error), "Unable to resolve comment decision"); }
	}
	async rejectExpired(authorId: string, ids: string[]): Promise<number> {
		try { if (ids.length > 100) throw new AppError("At most 100 operations can be reconciled", 400); return await this.client.$transaction(async tx => { await lockUsers(tx, [authorId]); const now = await readSqlTime(tx); const result = await tx.commentCreationDecision.updateMany({ where: { authorId, id: { in: [...new Set(ids)] }, state: "PREPARED", expiresAt: { lte: now } }, data: { state: "REJECTED", decidedAt: now, rejectionCode: "EXPIRED" } }); return result.count; }, ADMIN_TRANSACTION_OPTIONS); }
		catch (error) { return catchAndLogError(logger, failure(error), "Unable to reject expired comment decisions"); }
	}
}
export const commentCreationRepository = new CommentCreationRepository();
