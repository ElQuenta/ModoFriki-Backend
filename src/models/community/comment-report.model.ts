import mongoose, { Schema, type Model } from "mongoose";
import { REPORT_REASONS, REPORT_STATUSES, UUID_PATTERN, type CommentReportRecord } from "./community.types";

const immutableUuid = { type: String, required: true, immutable: true, match: UUID_PATTERN };

export const commentReportSchema = new Schema<CommentReportRecord>({
	_id: immutableUuid,
	commentId: immutableUuid,
	reporterId: immutableUuid,
	reason: { type: String, required: true, enum: REPORT_REASONS, immutable: true },
	details: { type: String, default: null, maxlength: 2000, immutable: true },
	status: { type: String, required: true, default: "OPEN", enum: REPORT_STATUSES },
	reviewedAt: { type: Date, default: null },
	reviewedById: { type: String, default: null, match: UUID_PATTERN },
	resolution: { type: String, default: null, maxlength: 2000 }
}, { collection: "commentReports", timestamps: true, versionKey: false, strict: "throw" });

commentReportSchema.index({ commentId: 1, reporterId: 1 }, { unique: true });
commentReportSchema.index({ status: 1, createdAt: 1, _id: 1 });

export const CommentReportModel: Model<CommentReportRecord> = (mongoose.models.CommunityCommentReport as Model<CommentReportRecord> | undefined)
	?? mongoose.model<CommentReportRecord>("CommunityCommentReport", commentReportSchema);
