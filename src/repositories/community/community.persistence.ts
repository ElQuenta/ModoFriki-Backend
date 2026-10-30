import mongoose, { type ClientSession, type Model } from "mongoose";
import AppError from "../../utils/AppError";
import { CommentModel } from "../../models/community/comment.model";
import { CommentVoteModel } from "../../models/community/comment-vote.model";
import { CommentReportModel } from "../../models/community/comment-report.model";
import type { CommentRecord, CommentVoteRecord, CommentReportRecord } from "../../models/community/community.types";
import type { CommentCreationRepositoryContract } from "../../types/comment-creation.types";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("CommunityPersistence");

export interface CommunityDependencies {
	comments: Model<CommentRecord>;
	votes: Model<CommentVoteRecord>;
	reports: Model<CommentReportRecord>;
	startSession: () => Promise<ClientSession>;
	decisions?: CommentCreationRepositoryContract;
}

export function communityDependencies(options: Partial<CommunityDependencies>): CommunityDependencies {
	try {
		return {
			comments: options.comments ?? CommentModel,
			votes: options.votes ?? CommentVoteModel,
			reports: options.reports ?? CommentReportModel,
			startSession: options.startSession ?? startCommunitySession,
			decisions: options.decisions
		};
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to initialize community persistence");
	}
}

function hasCreationMarker(comment: CommentRecord): boolean {
	return Object.prototype.hasOwnProperty.call(comment, "creationOperationId");
}

function validCreationMarker(comment: CommentRecord): boolean {
	return hasCreationMarker(comment)
		&& typeof comment.creationOperationId === "string"
		&& comment.creationOperationId === comment._id;
}

/** Legacy means strict field absence. Marked comments fail closed through PostgreSQL. */
export async function filterAccessibleBatch(
	dependencies: CommunityDependencies,
	comments: CommentRecord[]
): Promise<CommentRecord[]> {
	try {
		const marked = comments.filter(hasCreationMarker);
		if (marked.length === 0) return comments;
		if (!dependencies.decisions) throw new AppError("Comment publication verification unavailable", 503);
		const valid = marked.filter(validCreationMarker);
		const decisions = valid.length === 0 ? [] : await dependencies.decisions.findDecisions(valid.map((row) => row._id));
		const committed = new Set(decisions
			.filter((decision) => decision.state === "COMMITTED")
			.map((decision) => `${decision.id}:${decision.authorId}`));
		return comments.filter((comment) => !hasCreationMarker(comment)
			|| (validCreationMarker(comment) && committed.has(`${comment._id}:${comment.authorId}`)));
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to verify comment publication", { preserveOriginal: true });
	}
}

export async function findAccessibleById(
	dependencies: CommunityDependencies,
	commentId: string,
	options: { session?: ClientSession } = {}
): Promise<CommentRecord | null> {
	try {
		const query = dependencies.comments.findById(commentId).lean();
		if (options.session) query.session(options.session);
		const comment = await query.exec();
		if (!comment) return null;
		return (await filterAccessibleBatch(dependencies, [comment]))[0] ?? null;
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to find accessible comment", { preserveOriginal: true });
	}
}

export async function requireAccessibleComment(
	dependencies: CommunityDependencies,
	commentId: string
): Promise<CommentRecord> {
	const comment = await findAccessibleById(dependencies, commentId);
	if (!comment) throw new AppError("Comment not found", 404);
	return comment;
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
		return catchAndLogError(logger, new AppError("Community persistence unavailable", 503), "Community persistence operation failed");
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
				}, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
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
