import mongoose, { type ClientSession, type Model } from "mongoose";
import AppError from "../../utils/AppError";
import { CommentModel } from "../../models/community/comment.model";
import { CommentVoteModel } from "../../models/community/comment-vote.model";
import { CommentReportModel } from "../../models/community/comment-report.model";
import type { CommentRecord, CommentVoteRecord, CommentReportRecord } from "../../models/community/community.types";

export interface CommunityDependencies {
	comments: Model<CommentRecord>;
	votes: Model<CommentVoteRecord>;
	reports: Model<CommentReportRecord>;
	startSession: () => Promise<ClientSession>;
}

export function communityDependencies(options: Partial<CommunityDependencies>): CommunityDependencies {
	return {
		comments: options.comments ?? CommentModel,
		votes: options.votes ?? CommentVoteModel,
		reports: options.reports ?? CommentReportModel,
		startSession: options.startSession ?? (() => mongoose.startSession())
	};
}

/** Do not expose driver errors, collection names, URIs or stored content to callers. */
export async function persistenceOperation<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof AppError) throw error;
		if (error && typeof error === "object" && "code" in error && error.code === 11000) {
			throw new AppError("Community record already exists", 409);
		}
		if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
			throw new AppError("Invalid community data", 400);
		}
		throw new AppError("Community persistence operation failed", 500);
	}
}

/** Requires a transaction-capable replica set; intentionally has no standalone fallback. */
export async function communityTransaction<T>(dependencies: CommunityDependencies, operation: (session: ClientSession) => Promise<T>): Promise<T> {
	return persistenceOperation(async () => {
		const session = await dependencies.startSession();
		try {
			let result: T;
			await session.withTransaction(async () => {
				result = await operation(session);
			});
			return result!;
		} finally {
			await session.endSession();
		}
	});
}

/** The shared write serializes replies/votes/reports against soft deletion. */
export async function touchActiveComment(dependencies: CommunityDependencies, commentId: string, session: ClientSession): Promise<CommentRecord> {
	const comment = await dependencies.comments.findOneAndUpdate(
		{ _id: commentId, status: "ACTIVE" },
		{ $inc: { revision: 1 } },
		{ new: true, runValidators: true, session }
	).lean().exec();
	if (!comment) throw new AppError("Active comment not found", 404);
	return comment;
}
