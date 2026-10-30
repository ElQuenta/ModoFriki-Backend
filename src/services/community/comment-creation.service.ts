import { createHash, randomUUID } from "node:crypto";
import type { CommentRecord } from "../../models/community/community.types";
import { catalogRepository, type CatalogRepositoryContract } from "../../repositories/community/catalog.repository";
import { CommentRepository } from "../../repositories/community/comment.repository";
import { commentCreationRepository } from "../../repositories/community/comment-creation.repository";
import type { CommentCreationRepositoryContract, StagedCommentTarget } from "../../types/comment-creation.types";
import type { AuthUser } from "../../types/express";
import AppError from "../../utils/AppError";

export type CreateCommentRequest =
	| { targetType: "WORK" | "CHAPTER"; targetId: string; bodyMarkdown: string; parentCommentId?: never }
	| { parentCommentId: string; bodyMarkdown: string; targetType?: never; targetId?: never };

/** Coordinates the SQL permission journal and durable Mongo content without a distributed transaction. */
export class CommentCreationService {
	constructor(
		private readonly decisions: CommentCreationRepositoryContract = commentCreationRepository,
		private readonly comments: Pick<CommentRepository, "stageRoot" | "stageReply" | "recoverCommitted"> = new CommentRepository({ decisions: commentCreationRepository }),
		private readonly catalog: CatalogRepositoryContract = catalogRepository
	) {}

	private fingerprint(actorId: string, request: CreateCommentRequest): string {
		const canonical = "parentCommentId" in request
			? { authorId: actorId, kind: "REPLY", parentCommentId: request.parentCommentId, bodyMarkdown: request.bodyMarkdown }
			: { authorId: actorId, kind: "ROOT", targetType: request.targetType, targetId: request.targetId, bodyMarkdown: request.bodyMarkdown };
		return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
	}

	private async stagedTarget(record: CommentRecord): Promise<StagedCommentTarget> {
		if (record.targetType === "WORK") return { targetType: "WORK", targetId: record.targetId, workId: record.targetId };
		const chapter = await this.catalog.findChapter(record.targetId);
		// The SQL finalize still revalidates the chapter and work while holding its locks.
		if (!chapter) return { targetType: "CHAPTER", targetId: record.targetId, workId: record.targetId };
		return { targetType: "CHAPTER", targetId: record.targetId, workId: chapter.workId };
	}

	async create(request: CreateCommentRequest, actor: AuthUser, idempotencyKey?: string): Promise<CommentRecord> {
		const operationId = idempotencyKey ?? randomUUID();
		const input = { operationId, requestFingerprint: this.fingerprint(actor.id, request) };
		const prepared = await this.decisions.prepare({ id: actor.id }, input);
		if (prepared.state === "REJECTED") {
			if (prepared.rejectionCode === "TARGET_UNAVAILABLE") throw new AppError("Comment target not found", 404);
			if (prepared.rejectionCode === "SANCTIONED") throw new AppError("Comment creation restricted", 403);
			throw new AppError("Comment creation outcome unavailable", 503);
		}
		if (prepared.state === "COMMITTED") return this.comments.recoverCommitted(operationId, actor.id);
		let staged: CommentRecord;
		if (typeof request.parentCommentId === "string") {
			staged = await this.comments.stageReply({ operationId, authorId: actor.id, parentCommentId: request.parentCommentId, bodyMarkdown: request.bodyMarkdown });
		} else {
			staged = await this.comments.stageRoot({ operationId, authorId: actor.id, targetType: request.targetType, targetId: request.targetId, bodyMarkdown: request.bodyMarkdown });
		}
		const final = await this.decisions.finalize({ id: actor.id }, operationId, await this.stagedTarget(staged));
		if (final.state === "COMMITTED") return staged;
		if (final.rejectionCode === "TARGET_UNAVAILABLE") throw new AppError("Comment target not found", 404);
		if (final.rejectionCode === "SANCTIONED") throw new AppError("Comment creation restricted", 403);
		throw new AppError("Comment creation outcome unavailable", 503);
	}
}

export const commentCreationService = new CommentCreationService();
