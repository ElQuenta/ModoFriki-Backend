import mongoose, { Schema, type Model } from "mongoose";
import { UUID_PATTERN, type CommentVoteRecord } from "./community.types";

const immutableUuid = { type: String, required: true, immutable: true, match: UUID_PATTERN };

export const commentVoteSchema = new Schema<CommentVoteRecord>({
	_id: immutableUuid,
	commentId: immutableUuid,
	userId: immutableUuid,
	value: { type: Number, required: true, enum: [-1, 1] }
}, { collection: "commentVotes", timestamps: true, versionKey: false, strict: "throw" });

commentVoteSchema.index({ commentId: 1, userId: 1 }, { unique: true });

export const CommentVoteModel: Model<CommentVoteRecord> = (mongoose.models.CommunityCommentVote as Model<CommentVoteRecord> | undefined)
	?? mongoose.model<CommentVoteRecord>("CommunityCommentVote", commentVoteSchema);
