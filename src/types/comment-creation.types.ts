import type { CommentTargetType } from "../models/community/community.types";

export const COMMENT_PREPARATION_SECONDS = 60;
export const COMMENT_REJECTION_CODES = ["SANCTIONED", "ACCOUNT_UNAVAILABLE", "EXPIRED", "CANCELLED", "TARGET_UNAVAILABLE"] as const;
export type CommentRejectionCode = typeof COMMENT_REJECTION_CODES[number];
export type CommentCreationState = "PREPARED" | "COMMITTED" | "REJECTED";

interface DecisionBase {
	id: string;
	authorId: string;
	requestFingerprint: string;
	preparedAt: Date;
	expiresAt: Date;
}
/** Permission journal only: no body, target or duplicate comment entity in SQL. */
export type CommentCreationDecision = DecisionBase & (
	| { state: "PREPARED"; decidedAt: null; rejectionCode: null }
	| { state: "COMMITTED"; decidedAt: Date; rejectionCode: null }
	| { state: "REJECTED"; decidedAt: Date; rejectionCode: CommentRejectionCode }
);
export interface CommentCreationActor { id: string }
export interface PrepareCommentInput { operationId: string; requestFingerprint: string }
/** Derived from durable Mongo staging; never constructed directly from an HTTP body. */
export interface StagedCommentTarget { targetType: CommentTargetType; targetId: string; workId: string }
export interface CommentDecisionVisibility { id: string; authorId: string; state: CommentCreationState }
export type FinalizeCommentResult = CommentCreationDecision;
export interface CommentCreationRepositoryContract {
	prepare(author: CommentCreationActor, input: PrepareCommentInput): Promise<CommentCreationDecision>;
	/** REJECTED is returned after commit; throwing inside SQL would undo the decision. */
	finalize(author: CommentCreationActor, operationId: string, stagedTarget: StagedCommentTarget): Promise<CommentCreationDecision>;
	findDecisions(ids: string[]): Promise<CommentDecisionVisibility[]>;
	/** Resolve existing state without granting a fresh creation permission. */
	resolve(author: CommentCreationActor, input: PrepareCommentInput): Promise<CommentCreationDecision | null>;
	/** Manual bounded reconciliation; never promotes decisions or deletes content. */
	rejectExpired(authorId: string, ids: string[]): Promise<number>;
}
