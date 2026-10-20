import mongoose, { type ClientSession, type Model } from "mongoose";
import AppError from "../../utils/AppError";
import { CommentModel } from "../../models/community/comment.model";
import { CommentVoteModel } from "../../models/community/comment-vote.model";
import { CommentReportModel } from "../../models/community/comment-report.model";
import type { CommentRecord, CommentVoteRecord, CommentReportRecord } from "../../models/community/community.types";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("CommunityPersistence");

export interface CommunityDependencies {
	comments: Model<CommentRecord>;
	votes: Model<CommentVoteRecord>;
	reports: Model<CommentReportRecord>;
	startSession: () => Promise<ClientSession>;
}

export function communityDependencies(options: Partial<CommunityDependencies>): CommunityDependencies {
	try {
		logger.debug("Resolving community persistence dependencies");
		return {
			comments: options.comments ?? CommentModel,
			votes: options.votes ?? CommentVoteModel,
			reports: options.reports ?? CommentReportModel,
			startSession: options.startSession ?? startCommunitySession
		};
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to initialize community persistence");
	}
}

async function startCommunitySession(): Promise<ClientSession> {
	try {
		logger.debug("Starting community persistence session");
		return await mongoose.startSession();
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to start community session");
	}
}

/** Do not expose driver errors, collection names, URIs or stored content to callers. */
export async function persistenceOperation<T>(operation: () => Promise<T>): Promise<T> {
	try {
		logger.debug("Executing community persistence operation");
		return await operation();
	} catch (error) {
		if (error instanceof AppError) return catchAndLogError(logger, error, "Community persistence operation failed");
		if (error && typeof error === "object" && "code" in error && error.code === 11000) {
			return catchAndLogError(logger, new AppError("Community record already exists", 409), "Community persistence operation failed");
		}
		if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
			return catchAndLogError(logger, new AppError("Invalid community data", 400), "Community persistence operation failed");
		}
		// Driver messages may contain document contents, credentials or connection strings.
		logger.error("Community persistence operation failed");
		return catchAndLogError(logger, new AppError("Community persistence operation failed", 500), "Community persistence operation failed");
	}
}

/** Requires a transaction-capable replica set; intentionally has no standalone fallback. */
export async function communityTransaction<T>(dependencies: CommunityDependencies, operation: (session: ClientSession) => Promise<T>): Promise<T> {
	try {
		logger.debug("Executing community transaction");
		return await persistenceOperation(async () => {
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
	} catch (error) {
		return catchAndLogError(logger, error, "Community transaction failed");
	}
}

/** The shared write serializes replies/votes/reports against soft deletion. */
export async function touchActiveComment(dependencies: CommunityDependencies, commentId: string, session: ClientSession): Promise<CommentRecord> {
	try {
		logger.debug("Touching active comment in transaction");
		const comment = await dependencies.comments.findOneAndUpdate(
			{ _id: commentId, status: "ACTIVE" },
			{ $inc: { revision: 1 } },
			{ new: true, runValidators: true, session }
		).lean().exec();
		if (!comment) throw new AppError("Active comment not found", 404);
		return comment;
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to touch active comment", { preserveOriginal: true });
	}
}
