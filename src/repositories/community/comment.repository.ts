import { catchAndLogError, createLogger } from "../../utils/logger";
import { randomUUID } from "node:crypto";
import AppError from "../../utils/AppError";
import { COMMENT_TARGET_TYPES, type CommentRecord, type CommentTargetType } from "../../models/community/community.types";
import { communityDependencies, communityTransaction, filterAccessibleBatch, findAccessibleById, persistenceOperation, requireAccessibleComment, touchActiveComment, type CommunityDependencies } from "./community.persistence";
import { cursorFilter, enumValue, pageOptions, revision, text, uuid, type CommunityPage, type CommunityPageOptions } from "./community.validation";
import type { ValidatedSanctionEvidence } from "../../types/sanctions.types";
import { commentCreationRepository } from "./comment-creation.repository";

const logger = createLogger("CommentRepository");

export interface CreateRootCommentInput {
	authorId: string;
	targetType: CommentTargetType;
	targetId: string;
	bodyMarkdown: string;
}

export interface CreateReplyInput {
	authorId: string;
	parentCommentId: string;
	bodyMarkdown: string;
}

export interface StageRootCommentInput extends CreateRootCommentInput { operationId: string }
export interface StageReplyCommentInput extends CreateReplyInput { operationId: string }
type StageRootCanonical = Pick<CommentRecord, "_id" | "creationOperationId" | "authorId" | "targetType" | "targetId" | "parentCommentId" | "rootCommentId" | "bodyMarkdown">;

export class CommentRepository {
	private readonly dependencies: CommunityDependencies;

	constructor(options: Partial<CommunityDependencies> = {}) {
		this.dependencies = communityDependencies({ ...options, decisions: options.decisions ?? commentCreationRepository });
	}

	async createRoot(input: CreateRootCommentInput): Promise<CommentRecord> {
		return this.stageRoot({ ...input, operationId: randomUUID() });
	}

	async createReply(input: CreateReplyInput): Promise<CommentRecord> {
		return this.stageReply({ ...input, operationId: randomUUID() });
	}

	async stageRoot(input: StageRootCommentInput): Promise<CommentRecord> {
		try {
			logger.debug("stageRoot");
			const operationId = uuid(input.operationId, "operationId");
			const expected: StageRootCanonical = {
				_id: operationId, creationOperationId: operationId,
				authorId: uuid(input.authorId, "authorId"),
				targetType: enumValue(input.targetType, COMMENT_TARGET_TYPES, "targetType"),
				targetId: uuid(input.targetId, "targetId"), parentCommentId: null, rootCommentId: operationId,
				bodyMarkdown: text(input.bodyMarkdown, "bodyMarkdown", 10000)
			};
			return await persistenceOperation(async () => {
				const recovered = await this.recoverStaged(expected);
				if (recovered) return recovered;
				try {
					const now = new Date();
					const comment = new this.dependencies.comments({
						...expected, status: "ACTIVE", revision: 0, createdAt: now, updatedAt: now
					});
					await comment.validate();
					await this.dependencies.comments.collection.insertOne(
						comment.toObject() as never,
						{ writeConcern: { w: "majority" } }
					);
					const durable = await this.recoverStaged(expected);
					if (!durable) throw new AppError("Durable comment staging could not be verified", 503);
					return durable;
				} catch (error) {
					const afterFailure = await this.recoverStaged(expected);
					if (afterFailure) return afterFailure;
					throw error;
				}
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: stageRoot failed");
		}
	}

	async stageReply(input: StageReplyCommentInput): Promise<CommentRecord> {
		try {
			logger.debug("stageReply");
			const operationId = uuid(input.operationId, "operationId");
			const authorId = uuid(input.authorId, "authorId");
			const parentCommentId = uuid(input.parentCommentId, "parentCommentId");
			const bodyMarkdown = text(input.bodyMarkdown, "bodyMarkdown", 10000);
			return await persistenceOperation(async () => {
				const existing = await this.readStaged(operationId);
				if (existing) return this.assertReplyReplay(existing, { operationId, authorId, parentCommentId, bodyMarkdown });
				await requireAccessibleComment(this.dependencies, parentCommentId);
				try {
					return await communityTransaction(this.dependencies, async (session) => {
						const parent = await touchActiveComment(this.dependencies, parentCommentId, session);
						const [comment] = await this.dependencies.comments.create([{
							_id: operationId, creationOperationId: operationId, authorId, parentCommentId,
							rootCommentId: parent.rootCommentId, targetType: parent.targetType, targetId: parent.targetId,
							bodyMarkdown, status: "ACTIVE", revision: 0
						}], { session });
						return comment.toObject();
					});
				} catch (error) {
					const recovered = await this.readStaged(operationId);
					if (recovered) return this.assertReplyReplay(recovered, { operationId, authorId, parentCommentId, bodyMarkdown });
					throw error;
				}
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: stageReply failed");
		}
	}

	private async readStaged(operationId: string): Promise<CommentRecord | null> {
		return this.dependencies.comments.findById(operationId).read("primary").readConcern("majority").lean().exec();
	}

	private async recoverStaged(expected: StageRootCanonical): Promise<CommentRecord | null> {
		const existing = await this.readStaged(expected._id);
		if (!existing) return null;
		const same = existing.creationOperationId === expected.creationOperationId
			&& existing.authorId === expected.authorId && existing.targetType === expected.targetType
			&& existing.targetId === expected.targetId && existing.parentCommentId === expected.parentCommentId
			&& existing.rootCommentId === expected.rootCommentId && existing.bodyMarkdown === expected.bodyMarkdown;
		if (!same) throw new AppError("Idempotency key conflicts with staged comment", 409);
		return existing;
	}

	private assertReplyReplay(existing: CommentRecord, expected: { operationId: string; authorId: string; parentCommentId: string; bodyMarkdown: string }): CommentRecord {
		if (existing.creationOperationId !== expected.operationId || existing.authorId !== expected.authorId
			|| existing.parentCommentId !== expected.parentCommentId || existing.bodyMarkdown !== expected.bodyMarkdown) {
			throw new AppError("Idempotency key conflicts with staged comment", 409);
		}
		return existing;
	}

	async findById(commentId: string): Promise<CommentRecord | null> {
		try {
			logger.debug("findById");
			const id = uuid(commentId, "commentId");
			return await persistenceOperation(() => findAccessibleById(this.dependencies, id));
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: findById failed");
		}
	}

	async findCommentEvidence(commentId: string): Promise<ValidatedSanctionEvidence | null> {
		try {
			const id = uuid(commentId, "commentId");
			const comment = await persistenceOperation(() => findAccessibleById(this.dependencies, id));
			return comment ? { reference: { type: "COMMENT", id }, authorId: comment.authorId } : null;
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: findCommentEvidence failed");
		}
	}

	async listRoots(input: CommunityPageOptions & { targetType: CommentTargetType; targetId: string }): Promise<CommunityPage<CommentRecord>> {
		try {
			logger.debug("listRoots");
			const targetType = enumValue(input.targetType, COMMENT_TARGET_TYPES, "targetType");
			const targetId = uuid(input.targetId, "targetId");
			return await this.list({ targetType, targetId, parentCommentId: null }, input);
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: listRoots failed");
		}
	}

	async listReplies(input: CommunityPageOptions & { parentCommentId: string }): Promise<CommunityPage<CommentRecord>> {
		try {
			logger.debug("listReplies");
			return await this.list({ parentCommentId: uuid(input.parentCommentId, "parentCommentId") }, input);
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: listReplies failed");
		}
	}

	/** Includes the root marker and descendants; never expands a recursive document tree. */
	async listThread(input: CommunityPageOptions & { rootCommentId: string }): Promise<CommunityPage<CommentRecord>> {
		try {
			logger.debug("listThread");
			return await this.list({ rootCommentId: uuid(input.rootCommentId, "rootCommentId") }, input);
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: listThread failed");
		}
	}

	private async list(filter: Record<string, unknown>, options: CommunityPageOptions): Promise<CommunityPage<CommentRecord>> {
		try {
			logger.debug("list");
			const { limit, cursor } = pageOptions(options);
			return await persistenceOperation(async () => {
				const rows = await this.dependencies.comments.find({ ...filter, ...cursorFilter(cursor) })
					.sort({ createdAt: 1, _id: 1 }).limit(limit + 1).lean().exec();
				const examined = rows.slice(0, limit);
				const items = await filterAccessibleBatch(this.dependencies, examined);
				const hasMore = rows.length > limit;
				const last = examined.at(-1);
				return { items, hasMore, nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last._id } : null };
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: list failed");
		}
	}

	async editOwn(input: { commentId: string; authorId: string; bodyMarkdown: string; expectedRevision: number }): Promise<CommentRecord> {
		try {
			logger.debug("editOwn");
			const commentId = uuid(input.commentId, "commentId");
			const authorId = uuid(input.authorId, "authorId");
			const bodyMarkdown = text(input.bodyMarkdown, "bodyMarkdown", 10000);
			const expectedRevision = revision(input.expectedRevision);
			if (!await findAccessibleById(this.dependencies, commentId)) throw new AppError("Comment not found", 404);
			return await persistenceOperation(async () => {
				const comment = await this.dependencies.comments.findOneAndUpdate(
					{ _id: commentId, authorId, status: "ACTIVE", revision: expectedRevision },
					{ $set: { bodyMarkdown, editedAt: new Date() }, $inc: { revision: 1 } },
					{ new: true, runValidators: true }
				).lean().exec();
				if (!comment) throw new AppError("Comment unavailable for editing or revision changed", 409);
				return comment;
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: editOwn failed");
		}
	}

	async softDeleteOwn(input: { commentId: string; authorId: string }): Promise<CommentRecord> {
		try {
			logger.debug("softDeleteOwn");
			const authorId = uuid(input.authorId, "authorId");
			return await this.softDelete(uuid(input.commentId, "commentId"), authorId, { authorId });
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: softDeleteOwn failed");
		}
	}

	/** Caller must verify ADMIN role in the Service before invoking this explicit method. */
	async softDeleteAsModerator(input: { commentId: string; moderatorId: string }): Promise<CommentRecord> {
		try {
			logger.debug("softDeleteAsModerator");
			return await this.softDelete(uuid(input.commentId, "commentId"), uuid(input.moderatorId, "moderatorId"), {});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: softDeleteAsModerator failed");
		}
	}

	private async softDelete(commentId: string, actorId: string, ownership: { authorId?: string }): Promise<CommentRecord> {
		try {
			logger.debug("softDelete");
			if (!await findAccessibleById(this.dependencies, commentId)) throw new AppError("Comment not found", 404);
			return await persistenceOperation(async () => {
				const comment = await this.dependencies.comments.findOneAndUpdate(
					{ _id: commentId, status: "ACTIVE", ...ownership },
					{ $set: { status: "DELETED", bodyMarkdown: null, deletedAt: new Date(), deletedById: actorId }, $inc: { revision: 1 } },
					{ new: true, runValidators: true }
				).lean().exec();
				if (!comment) throw new AppError("Active comment not found", 404);
				return comment;
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: softDelete failed");
		}
	}
}
