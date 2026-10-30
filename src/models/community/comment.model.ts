import mongoose, { Schema, type Model } from "mongoose";
import { COMMENT_STATUSES, COMMENT_TARGET_TYPES, UUID_PATTERN, type CommentRecord } from "./community.types";

const immutableUuid = { type: String, required: true, immutable: true, match: UUID_PATTERN };

export const commentSchema = new Schema<CommentRecord>({
	_id: immutableUuid,
	creationOperationId: { type: String, required: false, immutable: true, match: UUID_PATTERN },
	authorId: immutableUuid,
	targetType: { type: String, enum: COMMENT_TARGET_TYPES, required: true, immutable: true },
	targetId: immutableUuid,
	parentCommentId: { type: String, default: null, immutable: true, match: UUID_PATTERN },
	rootCommentId: immutableUuid,
	bodyMarkdown: {
		type: String,
		default: null,
		maxlength: 10000,
		required: function (this: CommentRecord) { return this.status === "ACTIVE"; },
		validate: {
			validator: (value: string | null) => value === null || value.trim().length > 0,
			message: "Comment content cannot be blank"
		}
	},
	status: { type: String, enum: COMMENT_STATUSES, default: "ACTIVE", required: true },
	revision: { type: Number, default: 0, required: true, min: 0, validate: Number.isSafeInteger },
	editedAt: { type: Date, default: null },
	deletedAt: { type: Date, default: null },
	deletedById: { type: String, default: null, match: UUID_PATTERN }
}, { collection: "comments", timestamps: true, versionKey: false, strict: "throw" });

commentSchema.pre("validate", function () {
	if (this.creationOperationId !== undefined && this.creationOperationId !== this._id) {
		this.invalidate("creationOperationId", "Creation operation must match the comment id");
	}
	if (this.parentCommentId === null && this.rootCommentId !== this._id) {
		this.invalidate("rootCommentId", "A root comment must reference itself");
	}
	if (this.parentCommentId !== null && (this.parentCommentId === this._id || this.rootCommentId === this._id)) {
		this.invalidate("parentCommentId", "A reply cannot reference itself as parent or root");
	}
});

commentSchema.index({ targetType: 1, targetId: 1, parentCommentId: 1, createdAt: 1, _id: 1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1, _id: 1 });
commentSchema.index({ rootCommentId: 1, createdAt: 1, _id: 1 });
commentSchema.index(
	{ creationOperationId: 1 },
	{ unique: true, partialFilterExpression: { creationOperationId: { $type: "string" } } }
);

export const CommentModel: Model<CommentRecord> = (mongoose.models.CommunityComment as Model<CommentRecord> | undefined)
	?? mongoose.model<CommentRecord>("CommunityComment", commentSchema);
