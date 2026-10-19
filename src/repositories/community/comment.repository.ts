import { randomUUID } from "node:crypto";
import AppError from "../../utils/AppError";
import { COMMENT_TARGET_TYPES, type CommentRecord, type CommentTargetType } from "../../models/community/community.types";
import { communityDependencies, communityTransaction, persistenceOperation, touchActiveComment, type CommunityDependencies } from "./community.persistence";
import { cursorFilter, enumValue, pageOptions, pageResult, revision, text, uuid, type CommunityPage, type CommunityPageOptions } from "./community.validation";

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
		const authorId = uuid(input.authorId, "authorId");
		const targetId = uuid(input.targetId, "targetId");
		const targetType = enumValue(input.targetType, COMMENT_TARGET_TYPES, "targetType");
		const bodyMarkdown = text(input.bodyMarkdown, "bodyMarkdown", 10000);
		const id = randomUUID();
		return persistenceOperation(async () => {
			const comment = await this.dependencies.comments.create({
				_id: id, authorId, targetId, targetType, parentCommentId: null,
				rootCommentId: id, bodyMarkdown, status: "ACTIVE", revision: 0
			});
			return comment.toObject();
		});
	}

	async createReply(input: CreateReplyInput): Promise<CommentRecord> {
		const authorId = uuid(input.authorId, "authorId");
		const parentCommentId = uuid(input.parentCommentId, "parentCommentId");
		const bodyMarkdown = text(input.bodyMarkdown, "bodyMarkdown", 10000);
		return communityTransaction(this.dependencies, async (session) => {
			const parent = await touchActiveComment(this.dependencies, parentCommentId, session);
			const [comment] = await this.dependencies.comments.create([{
				_id: randomUUID(), authorId, parentCommentId, rootCommentId: parent.rootCommentId,
				targetType: parent.targetType, targetId: parent.targetId, bodyMarkdown,
				status: "ACTIVE", revision: 0
			}], { session });
			return comment.toObject();
		});
	}

	async findById(commentId: string): Promise<CommentRecord | null> {
		const id = uuid(commentId, "commentId");
		return persistenceOperation(() => this.dependencies.comments.findById(id).lean().exec());
	}

	async listRoots(input: CommunityPageOptions & { targetType: CommentTargetType; targetId: string }): Promise<CommunityPage<CommentRecord>> {
		const targetType = enumValue(input.targetType, COMMENT_TARGET_TYPES, "targetType");
		const targetId = uuid(input.targetId, "targetId");
		return this.list({ targetType, targetId, parentCommentId: null }, input);
	}

	async listReplies(input: CommunityPageOptions & { parentCommentId: string }): Promise<CommunityPage<CommentRecord>> {
		return this.list({ parentCommentId: uuid(input.parentCommentId, "parentCommentId") }, input);
	}

	/** Includes the root marker and descendants; never expands a recursive document tree. */
	async listThread(input: CommunityPageOptions & { rootCommentId: string }): Promise<CommunityPage<CommentRecord>> {
		return this.list({ rootCommentId: uuid(input.rootCommentId, "rootCommentId") }, input);
	}

	private async list(filter: Record<string, unknown>, options: CommunityPageOptions): Promise<CommunityPage<CommentRecord>> {
		const { limit, cursor } = pageOptions(options);
		return persistenceOperation(async () => {
			const rows = await this.dependencies.comments.find({ ...filter, ...cursorFilter(cursor) })
				.sort({ createdAt: 1, _id: 1 }).limit(limit + 1).lean().exec();
			return pageResult(rows, limit);
		});
	}

	async editOwn(input: { commentId: string; authorId: string; bodyMarkdown: string; expectedRevision: number }): Promise<CommentRecord> {
		const commentId = uuid(input.commentId, "commentId");
		const authorId = uuid(input.authorId, "authorId");
		const bodyMarkdown = text(input.bodyMarkdown, "bodyMarkdown", 10000);
		const expectedRevision = revision(input.expectedRevision);
		return persistenceOperation(async () => {
			const comment = await this.dependencies.comments.findOneAndUpdate(
				{ _id: commentId, authorId, status: "ACTIVE", revision: expectedRevision },
				{ $set: { bodyMarkdown, editedAt: new Date() }, $inc: { revision: 1 } },
				{ new: true, runValidators: true }
			).lean().exec();
			if (!comment) throw new AppError("Comment unavailable for editing or revision changed", 409);
			return comment;
		});
	}

	async softDeleteOwn(input: { commentId: string; authorId: string }): Promise<CommentRecord> {
		const authorId = uuid(input.authorId, "authorId");
		return this.softDelete(uuid(input.commentId, "commentId"), authorId, { authorId });
	}

	/** Caller must verify ADMIN role in the Service before invoking this explicit method. */
	async softDeleteAsModerator(input: { commentId: string; moderatorId: string }): Promise<CommentRecord> {
		return this.softDelete(uuid(input.commentId, "commentId"), uuid(input.moderatorId, "moderatorId"), {});
	}

	private async softDelete(commentId: string, actorId: string, ownership: { authorId?: string }): Promise<CommentRecord> {
		return persistenceOperation(async () => {
			const comment = await this.dependencies.comments.findOneAndUpdate(
				{ _id: commentId, status: "ACTIVE", ...ownership },
				{ $set: { status: "DELETED", bodyMarkdown: null, deletedAt: new Date(), deletedById: actorId }, $inc: { revision: 1 } },
				{ new: true, runValidators: true }
			).lean().exec();
			if (!comment) throw new AppError("Active comment not found", 404);
			return comment;
		});
	}
}
