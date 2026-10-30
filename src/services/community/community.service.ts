import { COMMENT_TARGET_TYPES, REPORT_REASONS, REPORT_STATUSES, type CommentRecord, type CommentReportRecord, type CommentTargetType } from "../../models/community/community.types";
import { authRepository } from "../../repositories/auth/auth.repository";
import { catalogRepository, type CatalogRepositoryContract } from "../../repositories/community/catalog.repository";
import { CommentRepository } from "../../repositories/community/comment.repository";
import { CommentVoteRepository } from "../../repositories/community/comment-vote.repository";
import { CommentReportRepository } from "../../repositories/community/comment-report.repository";
import { commentCreationRepository } from "../../repositories/community/comment-creation.repository";
import { CommentCreationService, commentCreationService, type CreateCommentRequest } from "./comment-creation.service";
import { enumValue, revision, text, uuid, type CommunityPage, type CommunityPageOptions } from "../../repositories/community/community.validation";
import type { AuthRepositoryContract } from "../../types/auth.types";
import type { AuthUser } from "../../types/express";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("CommunityService");
type CommentAccess = Pick<CommentRepository, "createRoot" | "createReply" | "findById" | "listRoots" | "listReplies" | "listThread" | "editOwn" | "softDeleteOwn" | "softDeleteAsModerator">;
type VoteAccess = Pick<CommentVoteRepository, "setVote" | "removeVote" | "getSummaries">;
type ReportAccess = Pick<CommentReportRepository, "create" | "listForModeration" | "resolveAsModerator">;

export interface CommentDto {
	id: string; author: { id: string; username: string } | null; targetType: CommentTargetType; targetId: string;
	parentCommentId: string | null; rootCommentId: string; bodyMarkdown: string | null; status: "ACTIVE" | "DELETED";
	revision: number; createdAt: string; editedAt: string | null; votes: { upvotes: number; downvotes: number; score: number };
}
export interface CursorPageDto<T> { items: T[]; hasMore: boolean; nextCursor: { createdAt: string; id: string } | null }
export interface ReportDto {
	id: string; commentId: string; reason: CommentReportRecord["reason"]; details: string | null;
	status: CommentReportRecord["status"]; createdAt: string;
}
export interface ModerationReportDto extends ReportDto {
	reporterId: string; reviewedById: string | null; reviewedAt: string | null; resolution: string | null; updatedAt: string;
}

export class CommunityService {
	constructor(
		private readonly comments: CommentAccess = new CommentRepository({ decisions: commentCreationRepository }),
		private readonly votes: VoteAccess = new CommentVoteRepository({ decisions: commentCreationRepository }),
		private readonly reports: ReportAccess = new CommentReportRepository({ decisions: commentCreationRepository }),
		private readonly catalog: CatalogRepositoryContract = catalogRepository,
		private readonly users: Pick<AuthRepositoryContract, "findByIds"> = authRepository,
		private readonly publication: Pick<CommentCreationService, "create"> = commentCreationService
	) {}

	private input(input: unknown, allowed: string[]): Record<string, unknown> {
		try {
			if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError("Expected an object", 400);
			if (Object.keys(input).some((key) => !allowed.includes(key))) throw new AppError("Unknown input field", 400);
			return input as Record<string, unknown>;
		} catch (error) { return catchAndLogError(logger, error, "Unable to validate community input"); }
	}

	private pagination(query: Record<string, unknown>): CommunityPageOptions {
		try {
			const value = query.limit ?? 20;
			if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d{0,2}$/.test(value))) throw new AppError("Invalid limit", 400);
			const limit = Number(value);
			if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError("Invalid limit", 400);
			if (query.cursorCreatedAt === undefined && query.cursorId === undefined) return { limit };
			if (typeof query.cursorCreatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(query.cursorCreatedAt)) throw new AppError("Invalid cursorCreatedAt", 400);
			const createdAt = new Date(query.cursorCreatedAt);
			const normalized = query.cursorCreatedAt.replace(/(?:\.(\d{1,3}))?Z$/, (_match, millis: string | undefined) => `.${(millis ?? "").padEnd(3, "0")}Z`);
			if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== normalized) throw new AppError("Invalid cursorCreatedAt", 400);
			return { limit, cursor: { createdAt, id: uuid(query.cursorId, "cursorId") } };
		} catch (error) { return catchAndLogError(logger, error, "Unable to validate community cursor"); }
	}

	private actor(actor: AuthUser, admin = false): void {
		try {
			if (!actor || !["BASIC", "EDITOR", "ADMIN"].includes(actor.role)) throw new AppError("Authentication required", 401);
			uuid(actor.id, "actorId");
			if (admin && actor.role !== "ADMIN") throw new AppError("Insufficient permissions", 403);
		} catch (error) { return catchAndLogError(logger, error, "Unable to authorize community operation"); }
	}

	private async published(targetType: CommentTargetType, targetId: string): Promise<void> {
		try {
			const target = targetType === "WORK" ? await this.catalog.findWork(targetId) : await this.catalog.findChapter(targetId);
			if (!target) throw new AppError("Published destination not found", 404);
		} catch (error) { return catchAndLogError(logger, error, "Unable to verify comment destination"); }
	}

	private async comment(id: unknown, active = false, published = true): Promise<CommentRecord> {
		try {
			const comment = await this.comments.findById(uuid(id, "commentId"));
			if (!comment || (active && comment.status !== "ACTIVE")) throw new AppError("Comment not found", 404);
			if (published) await this.published(comment.targetType, comment.targetId);
			return comment;
		} catch (error) { return catchAndLogError(logger, error, "Unable to read comment"); }
	}

	private async dtos(records: CommentRecord[]): Promise<CommentDto[]> {
		try {
			if (records.length === 0) return [];
			const [authors, summaries] = await Promise.all([
				this.users.findByIds([...new Set(records.map((record) => record.authorId))]),
				this.votes.getSummaries(records.map((record) => record._id))
			]);
			const authorsById = new Map(authors.filter((author) => author.status === "ACTIVE" && author.deletedAt === null).map((author) => [author.id, author]));
			const summariesById = new Map(summaries.map((summary) => [summary.commentId, summary]));
			return records.map((record) => {
				const author = authorsById.get(record.authorId);
				const summary = summariesById.get(record._id);
				return {
					id: record._id, author: author ? { id: author.id, username: author.username } : null,
					targetType: record.targetType, targetId: record.targetId, parentCommentId: record.parentCommentId,
					rootCommentId: record.rootCommentId, bodyMarkdown: record.status === "ACTIVE" ? record.bodyMarkdown : null,
					status: record.status, revision: record.revision, createdAt: record.createdAt.toISOString(),
					editedAt: record.editedAt?.toISOString() ?? null,
					votes: { upvotes: summary?.upvotes ?? 0, downvotes: summary?.downvotes ?? 0, score: summary?.score ?? 0 }
				};
			});
		} catch (error) { return catchAndLogError(logger, error, "Unable to prepare public comments"); }
	}

	private page<T, U>(page: CommunityPage<T>, items: U[]): CursorPageDto<U> {
		try {
			return { items, hasMore: page.hasMore, nextCursor: page.nextCursor ? { createdAt: page.nextCursor.createdAt.toISOString(), id: page.nextCursor.id } : null };
		} catch (error) { return catchAndLogError(logger, error, "Unable to prepare community page"); }
	}

	private reportDto(report: CommentReportRecord): ReportDto {
		try {
			return { id: report._id, commentId: report.commentId, reason: report.reason, details: report.details, status: report.status, createdAt: report.createdAt.toISOString() };
		} catch (error) { return catchAndLogError(logger, error, "Unable to prepare report result"); }
	}

	private moderationDto(report: CommentReportRecord): ModerationReportDto {
		try {
			return { ...this.reportDto(report), reporterId: report.reporterId, reviewedById: report.reviewedById,
				reviewedAt: report.reviewedAt?.toISOString() ?? null, resolution: report.resolution, updatedAt: report.updatedAt.toISOString() };
		} catch (error) { return catchAndLogError(logger, error, "Unable to prepare moderation result"); }
	}

	async list(input: unknown): Promise<CursorPageDto<CommentDto>> {
		try {
			logger.debug("Listing public comments");
			const query = this.input(input, ["targetType", "targetId", "parentCommentId", "rootCommentId", "limit", "cursorCreatedAt", "cursorId"]);
			const options = this.pagination(query);
			const selectors = Number(query.targetType !== undefined || query.targetId !== undefined) + Number(query.parentCommentId !== undefined) + Number(query.rootCommentId !== undefined);
			if (selectors !== 1) throw new AppError("Exactly one comment selector is required", 400);
			let page: CommunityPage<CommentRecord>;
			if (query.parentCommentId !== undefined) {
				const parent = await this.comment(query.parentCommentId);
				page = await this.comments.listReplies({ ...options, parentCommentId: parent._id });
			} else if (query.rootCommentId !== undefined) {
				const root = await this.comment(query.rootCommentId);
				if (root.parentCommentId !== null || root.rootCommentId !== root._id) throw new AppError("Expected a root comment", 400);
				page = await this.comments.listThread({ ...options, rootCommentId: root._id });
			} else {
				const targetType = enumValue(query.targetType, COMMENT_TARGET_TYPES, "targetType");
				const targetId = uuid(query.targetId, "targetId");
				await this.published(targetType, targetId);
				page = await this.comments.listRoots({ ...options, targetType, targetId });
			}
			return this.page(page, await this.dtos(page.items));
		} catch (error) { return catchAndLogError(logger, error, "Unable to list comments"); }
	}

	async create(input: unknown, actor: AuthUser, idempotencyKey?: string): Promise<CommentDto> {
		try {
			logger.debug("Creating comment");
			this.actor(actor);
			const body = this.input(input, ["targetType", "targetId", "parentCommentId", "bodyMarkdown"]);
			const bodyMarkdown = text(body.bodyMarkdown, "bodyMarkdown", 10000);
			let request: CreateCommentRequest;
			if (body.parentCommentId !== undefined) {
				if (body.targetType !== undefined || body.targetId !== undefined) throw new AppError("Reply destination is inherited from its parent", 400);
				const parent = await this.comment(body.parentCommentId, true);
				request = { parentCommentId: parent._id, bodyMarkdown };
			} else {
				const targetType = enumValue(body.targetType, COMMENT_TARGET_TYPES, "targetType");
				const targetId = uuid(body.targetId, "targetId");
				await this.published(targetType, targetId);
				request = { targetType, targetId, bodyMarkdown };
			}
			const record = await this.publication.create(request, actor, idempotencyKey);
			return (await this.dtos([record]))[0];
		} catch (error) { return catchAndLogError(logger, error, "Unable to create comment"); }
	}

	async edit(id: unknown, input: unknown, actor: AuthUser): Promise<CommentDto> {
		try {
			logger.debug("Editing own comment");
			this.actor(actor);
			const body = this.input(input, ["bodyMarkdown", "expectedRevision"]);
			const bodyMarkdown = text(body.bodyMarkdown, "bodyMarkdown", 10000);
			const expectedRevision = revision(body.expectedRevision);
			const comment = await this.comment(id, true);
			if (comment.authorId !== actor.id) throw new AppError("Only the author can edit a comment", 403);
			return (await this.dtos([await this.comments.editOwn({ commentId: comment._id, authorId: actor.id, bodyMarkdown, expectedRevision })]))[0];
		} catch (error) { return catchAndLogError(logger, error, "Unable to edit comment"); }
	}

	async remove(id: unknown, actor: AuthUser): Promise<void> {
		try {
			logger.debug("Deleting comment and retaining descendants");
			this.actor(actor);
			const comment = await this.comment(id, true, false);
			if (comment.authorId === actor.id) await this.comments.softDeleteOwn({ commentId: comment._id, authorId: actor.id });
			else if (actor.role === "ADMIN") await this.comments.softDeleteAsModerator({ commentId: comment._id, moderatorId: actor.id });
			else throw new AppError("Only the author or ADMIN can delete a comment", 403);
		} catch (error) { return catchAndLogError(logger, error, "Unable to delete comment"); }
	}

	async setVote(id: unknown, input: unknown, actor: AuthUser) {
		try {
			logger.debug("Setting comment vote");
			this.actor(actor);
			const body = this.input(input, ["value"]);
			if (body.value !== -1 && body.value !== 1) throw new AppError("Invalid vote value", 400);
			const comment = await this.comment(id, true);
			await this.votes.setVote({ commentId: comment._id, userId: actor.id, value: body.value });
			return (await this.votes.getSummaries([comment._id]))[0];
		} catch (error) { return catchAndLogError(logger, error, "Unable to set comment vote"); }
	}

	async removeVote(id: unknown, actor: AuthUser): Promise<void> {
		try {
			logger.debug("Removing comment vote");
			this.actor(actor);
			const comment = await this.comment(id);
			await this.votes.removeVote({ commentId: comment._id, userId: actor.id });
		} catch (error) { return catchAndLogError(logger, error, "Unable to remove comment vote"); }
	}

	async report(id: unknown, input: unknown, actor: AuthUser): Promise<ReportDto> {
		try {
			logger.debug("Reporting comment");
			this.actor(actor);
			const body = this.input(input, ["reason", "details"]);
			const reason = enumValue(body.reason, REPORT_REASONS, "reason");
			const details = body.details === undefined ? undefined : text(body.details, "details", 2000);
			const comment = await this.comment(id, true);
			return this.reportDto(await this.reports.create({ commentId: comment._id, reporterId: actor.id, reason, details }));
		} catch (error) { return catchAndLogError(logger, error, "Unable to report comment"); }
	}

	async listReports(input: unknown, actor: AuthUser): Promise<CursorPageDto<ModerationReportDto>> {
		try {
			logger.debug("Listing moderation reports");
			this.actor(actor, true);
			const query = this.input(input, ["status", "limit", "cursorCreatedAt", "cursorId"]);
			const status = query.status === undefined ? undefined : enumValue(query.status, REPORT_STATUSES, "status");
			const page = await this.reports.listForModeration({ ...this.pagination(query), status });
			return this.page(page, page.items.map((record) => this.moderationDto(record)));
		} catch (error) { return catchAndLogError(logger, error, "Unable to list moderation reports"); }
	}

	async resolveReport(id: unknown, input: unknown, actor: AuthUser): Promise<ModerationReportDto> {
		try {
			logger.debug("Resolving moderation report");
			this.actor(actor, true);
			const body = this.input(input, ["status", "resolution"]);
			const status = enumValue(body.status, ["RESOLVED", "DISMISSED"] as const, "status");
			const resolution = text(body.resolution, "resolution", 2000);
			return this.moderationDto(await this.reports.resolveAsModerator({ reportId: uuid(id, "reportId"), moderatorId: actor.id, status, resolution }));
		} catch (error) { return catchAndLogError(logger, error, "Unable to resolve moderation report"); }
	}
}

export const communityService = new CommunityService();
