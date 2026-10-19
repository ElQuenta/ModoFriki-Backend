export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const COMMENT_TARGET_TYPES = ["WORK", "CHAPTER"] as const;
export const COMMENT_STATUSES = ["ACTIVE", "DELETED"] as const;
export const REPORT_REASONS = ["SPAM", "HARASSMENT", "HATE", "SPOILER", "OTHER"] as const;
export const REPORT_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;

export type CommentTargetType = typeof COMMENT_TARGET_TYPES[number];
export type CommentStatus = typeof COMMENT_STATUSES[number];
export type ReportReason = typeof REPORT_REASONS[number];
export type ReportStatus = typeof REPORT_STATUSES[number];

export interface CommentRecord {
	_id: string;
	authorId: string;
	targetType: CommentTargetType;
	targetId: string;
	parentCommentId: string | null;
	rootCommentId: string;
	bodyMarkdown: string | null;
	status: CommentStatus;
	revision: number;
	createdAt: Date;
	updatedAt: Date;
	editedAt: Date | null;
	deletedAt: Date | null;
	deletedById: string | null;
}

export interface CommentVoteRecord {
	_id: string;
	commentId: string;
	userId: string;
	value: -1 | 1;
	createdAt: Date;
	updatedAt: Date;
}

export interface CommentReportRecord {
	_id: string;
	commentId: string;
	reporterId: string;
	reason: ReportReason;
	details: string | null;
	status: ReportStatus;
	createdAt: Date;
	updatedAt: Date;
	reviewedAt: Date | null;
	reviewedById: string | null;
	resolution: string | null;
}
