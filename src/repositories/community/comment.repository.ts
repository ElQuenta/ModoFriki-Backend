import { catchAndLogError, createLogger } from "../../utils/logger";
import { randomUUID } from "node:crypto";
import AppError from "../../utils/AppError";
import { COMMENT_TARGET_TYPES, type CommentRecord, type CommentTargetType } from "../../models/community/community.types";
import { communityDependencies, communityTransaction, persistenceOperation, touchActiveComment, type CommunityDependencies } from "./community.persistence";
import { cursorFilter, enumValue, pageOptions, pageResult, revision, text, uuid, type CommunityPage, type CommunityPageOptions } from "./community.validation";

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

export class CommentRepository {
	private readonly dependencies: CommunityDependencies;

	constructor(options: Partial<CommunityDependencies> = {}) {
		this.dependencies = communityDependencies(options);
	}

	async createRoot(input: CreateRootCommentInput): Promise<CommentRecord> {
		try {
			logger.debug("createRoot");
			const authorId = uuid(input.authorId, "authorId");
			const targetId = uuid(input.targetId, "targetId");
			const targetType = enumValue(input.targetType, COMMENT_TARGET_TYPES, "targetType");
			const bodyMarkdown = text(input.bodyMarkdown, "bodyMarkdown", 10000);
			const id = randomUUID();
			return await persistenceOperation(async () => {
				const comment = await this.dependencies.comments.create({
					_id: id, authorId, targetId, targetType, parentCommentId: null,
					rootCommentId: id, bodyMarkdown, status: "ACTIVE", revision: 0
				});
				return comment.toObject();
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: createRoot failed");
		}
	}

	async createReply(input: CreateReplyInput): Promise<CommentRecord> {
		try {
			logger.debug("createReply");
			const authorId = uuid(input.authorId, "authorId");
			const parentCommentId = uuid(input.parentCommentId, "parentCommentId");
			const bodyMarkdown = text(input.bodyMarkdown, "bodyMarkdown", 10000);
			return await communityTransaction(this.dependencies, async (session) => {
				const parent = await touchActiveComment(this.dependencies, parentCommentId, session);
				const [comment] = await this.dependencies.comments.create([{
					_id: randomUUID(), authorId, parentCommentId, rootCommentId: parent.rootCommentId,
					targetType: parent.targetType, targetId: parent.targetId, bodyMarkdown,
					status: "ACTIVE", revision: 0
				}], { session });
				return comment.toObject();
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: createReply failed");
		}
	}

	async findById(commentId: string): Promise<CommentRecord | null> {
		try {
			logger.debug("findById");
			const id = uuid(commentId, "commentId");
			return await persistenceOperation(() => this.dependencies.comments.findById(id).lean().exec());
		} catch (error) {
			return catchAndLogError(logger, error, "CommentRepository: findById failed");
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
				return pageResult(rows, limit);
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
