import { randomUUID } from "node:crypto";
import AppError from "../../utils/AppError";
import { REPORT_REASONS, REPORT_STATUSES, type CommentReportRecord, type ReportReason, type ReportStatus } from "../../models/community/community.types";
import { communityDependencies, communityTransaction, persistenceOperation, touchActiveComment, type CommunityDependencies } from "./community.persistence";
import { cursorFilter, enumValue, pageOptions, pageResult, text, uuid, type CommunityPage, type CommunityPageOptions } from "./community.validation";

export class CommentReportRepository {
	private readonly dependencies: CommunityDependencies;

	constructor(options: Partial<CommunityDependencies> = {}) {
		this.dependencies = communityDependencies(options);
	}

	async create(input: { commentId: string; reporterId: string; reason: ReportReason; details?: string }): Promise<CommentReportRecord> {
		const commentId = uuid(input.commentId, "commentId");
		const reporterId = uuid(input.reporterId, "reporterId");
		const reason = enumValue(input.reason, REPORT_REASONS, "reason");
		const details = input.details === undefined ? null : text(input.details, "details", 2000);
		return communityTransaction(this.dependencies, async (session) => {
			await touchActiveComment(this.dependencies, commentId, session);
			const [report] = await this.dependencies.reports.create([{
				_id: randomUUID(), commentId, reporterId, reason, details, status: "OPEN"
			}], { session });
			return report.toObject();
		});
	}

	/** Restricted data: the Service must authorize moderation before invoking. */
	async listForModeration(input: CommunityPageOptions & { status?: ReportStatus }): Promise<CommunityPage<CommentReportRecord>> {
		const { limit, cursor } = pageOptions(input);
		const filter = input.status === undefined ? {} : { status: enumValue(input.status, REPORT_STATUSES, "status") };
		return persistenceOperation(async () => {
			const rows = await this.dependencies.reports.find({ ...filter, ...cursorFilter(cursor) })
				.sort({ createdAt: 1, _id: 1 }).limit(limit + 1).lean().exec();
			return pageResult(rows, limit);
		});
	}

	/** ADMIN gate belongs to the Service; resolved reports cannot be silently overwritten. */
	async resolveAsModerator(input: { reportId: string; moderatorId: string; status: "RESOLVED" | "DISMISSED"; resolution: string }): Promise<CommentReportRecord> {
		const reportId = uuid(input.reportId, "reportId");
		const moderatorId = uuid(input.moderatorId, "moderatorId");
		const status = enumValue(input.status, ["RESOLVED", "DISMISSED"] as const, "status");
		const resolution = text(input.resolution, "resolution", 2000);
		return persistenceOperation(async () => {
			const report = await this.dependencies.reports.findOneAndUpdate(
				{ _id: reportId, status: { $in: ["OPEN", "IN_REVIEW"] } },
				{ $set: { status, resolution, reviewedAt: new Date(), reviewedById: moderatorId } },
				{ new: true, runValidators: true }
			).lean().exec();
			if (!report) throw new AppError("Report unavailable for resolution", 409);
			return report;
		});
	}
}
