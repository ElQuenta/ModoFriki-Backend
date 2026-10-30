import { catchAndLogError, createLogger } from "../../utils/logger";
import { randomUUID } from "node:crypto";
import AppError from "../../utils/AppError";
import type { CommentVoteRecord } from "../../models/community/community.types";
import { communityDependencies, communityTransaction, filterAccessibleBatch, persistenceOperation, requireAccessibleComment, touchActiveComment, type CommunityDependencies } from "./community.persistence";
import { uuid } from "./community.validation";
import { commentCreationRepository } from "./comment-creation.repository";

const logger = createLogger("CommentVoteRepository");

export interface CommentVoteSummary {
	commentId: string;
	upvotes: number;
	downvotes: number;
	score: number;
}

export class CommentVoteRepository {
	private readonly dependencies: CommunityDependencies;

	constructor(options: Partial<CommunityDependencies> = {}) {
		this.dependencies = communityDependencies({ ...options, decisions: options.decisions ?? commentCreationRepository });
	}

	async setVote(input: { commentId: string; userId: string; value: -1 | 1 }): Promise<CommentVoteRecord> {
		try {
			logger.debug("setVote");
			const commentId = uuid(input.commentId, "commentId");
			const userId = uuid(input.userId, "userId");
			if (input.value !== -1 && input.value !== 1) throw new AppError("Invalid vote value", 400);
			const value = input.value;
			await requireAccessibleComment(this.dependencies, commentId);
			return await communityTransaction(this.dependencies, async (session) => {
				await touchActiveComment(this.dependencies, commentId, session);
				const vote = await this.dependencies.votes.findOneAndUpdate(
					{ commentId, userId },
					{ $set: { value }, $setOnInsert: { _id: randomUUID(), commentId, userId } },
					{ upsert: true, new: true, runValidators: true, session }
				).lean().exec();
				if (!vote) throw new AppError("Vote could not be stored", 500);
				return vote;
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentVoteRepository: setVote failed");
		}
	}

	/** Removing an absent vote succeeds; a deleted comment does not trap existing votes. */
	async removeVote(input: { commentId: string; userId: string }): Promise<boolean> {
		try {
			logger.debug("removeVote");
			const commentId = uuid(input.commentId, "commentId");
			const userId = uuid(input.userId, "userId");
			await requireAccessibleComment(this.dependencies, commentId);
			return await communityTransaction(this.dependencies, async (session) => {
				const result = await this.dependencies.votes.deleteOne({ commentId, userId }, { session }).exec();
				return result.deletedCount > 0;
			});
		} catch (error) {
			return catchAndLogError(logger, error, "CommentVoteRepository: removeVote failed");
		}
	}

	async getSummary(commentId: string): Promise<CommentVoteSummary> {
		try {
			logger.debug("getSummary");
			const id = uuid(commentId, "commentId");
			await requireAccessibleComment(this.dependencies, id);
			return (await this.aggregateSummaries([id]))[0];
		} catch (error) {
			return catchAndLogError(logger, error, "CommentVoteRepository: getSummary failed");
		}
	}

	/** One aggregate for a bounded page of comments, preserving request order. */
	async getSummaries(commentIds: string[]): Promise<CommentVoteSummary[]> {
		try {
			logger.debug("getSummaries");
			if (!Array.isArray(commentIds) || commentIds.length > 100) {
				throw new AppError("Expected at most 100 comment UUIDs", 400);
			}
			const requested = [...new Set(Array.from(commentIds, (value) => uuid(value, "commentId")))];
			if (requested.length === 0) return [];
			const comments = await persistenceOperation(() => this.dependencies.comments.find({ _id: { $in: requested } }).lean().exec());
			const ids = (await filterAccessibleBatch(this.dependencies, comments)).map((comment) => comment._id);
			if (ids.length === 0) return [];
			return this.aggregateSummaries(ids);
		} catch (error) {
			return catchAndLogError(logger, error, "CommentVoteRepository: getSummaries failed");
		}
	}

	private async aggregateSummaries(ids: string[]): Promise<CommentVoteSummary[]> {
		return await persistenceOperation(async () => {
				const rows = await this.dependencies.votes.aggregate<{
					_id: string; upvotes: number; downvotes: number; score: number;
				}>([
					{ $match: { commentId: { $in: ids } } },
					{ $group: {
						_id: "$commentId",
						upvotes: { $sum: { $cond: [{ $eq: ["$value", 1] }, 1, 0] } },
						downvotes: { $sum: { $cond: [{ $eq: ["$value", -1] }, 1, 0] } },
						score: { $sum: "$value" }
					} }
				]).exec();
				const summaries = new Map(rows.map((row) => [row._id, row]));
				return ids.map((commentId) => {
					const row = summaries.get(commentId);
					return { commentId, upvotes: row?.upvotes ?? 0, downvotes: row?.downvotes ?? 0, score: row?.score ?? 0 };
				});
			});
	}
}
