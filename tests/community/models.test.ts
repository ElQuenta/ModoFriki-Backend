import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { CommentModel, commentSchema } from "../../src/models/community/comment.model";
import { CommentVoteModel, commentVoteSchema } from "../../src/models/community/comment-vote.model";
import { CommentReportModel, commentReportSchema } from "../../src/models/community/comment-report.model";
import { comment, ids } from "./fakes";

test("models can be imported and validated without opening a database connection", async () => {
	assert.equal(mongoose.connection.readyState, 0);
	const doc = new CommentModel(comment());
	await doc.validate();
	assert.equal(doc.bodyMarkdown, "**Hello** ||spoiler||");
	assert.equal(typeof doc._id, "string");
	assert.equal(mongoose.connection.readyState, 0);
});

test("UUID references accept standard version 7 and reject malformed strings/ObjectId", async () => {
	await new CommentModel(comment({ authorId: "01992f67-2345-7abc-8abc-000000000001" })).validate();
	for (const value of ["507f1f77bcf86cd799439011", "not-a-uuid", "10000000-0000-4000-0000-000000000001"]) {
		await assert.rejects(new CommentModel(comment({ targetId: value })).validate(), (error: unknown) => error instanceof mongoose.Error.ValidationError && !!error.errors.targetId);
	}
});

test("active comments reject blank/missing/oversize bodies and invalid revisions", async () => {
	for (const bodyMarkdown of [null, "", " \n\t", "x".repeat(10001)]) {
		await assert.rejects(new CommentModel(comment({ bodyMarkdown })).validate(), (error: unknown) => error instanceof mongoose.Error.ValidationError && !!error.errors.bodyMarkdown);
	}
	for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
		await assert.rejects(new CommentModel(comment({ revision })).validate(), (error: unknown) => error instanceof mongoose.Error.ValidationError && !!error.errors.revision);
	}
	await new CommentModel(comment({ bodyMarkdown: "x".repeat(10000) })).validate();
});

test("deleted marker accepts null body and retains response links", async () => {
	const doc = new CommentModel(comment({ _id: ids.third, status: "DELETED", bodyMarkdown: null, deletedAt: new Date(), deletedById: ids.other, parentCommentId: ids.reply }));
	await doc.validate();
	assert.equal(doc.parentCommentId, ids.reply);
	assert.equal(doc.rootCommentId, ids.root);
});

test("async document validation enforces self-root and forbids self-parent/self-root replies", async () => {
	await new CommentModel(comment()).validate();
	await new CommentModel(comment({ _id: ids.reply, parentCommentId: ids.root })).validate();
	for (const fields of [
		{ rootCommentId: ids.third },
		{ _id: ids.reply, parentCommentId: ids.reply },
		{ _id: ids.reply, parentCommentId: ids.root, rootCommentId: ids.reply }
	]) {
		await assert.rejects(new CommentModel(comment(fields)).validate(), mongoose.Error.ValidationError);
	}
});

test("persisted comment cannot be reparented or assigned to a different author/target", () => {
	const doc = CommentModel.hydrate(comment({ _id: ids.reply, parentCommentId: ids.root }));
	doc.set({ authorId: ids.other, targetId: ids.third, targetType: "CHAPTER", parentCommentId: ids.third, rootCommentId: ids.third });
	assert.equal(doc.authorId, ids.author);
	assert.equal(doc.targetId, ids.work);
	assert.equal(doc.targetType, "WORK");
	assert.equal(doc.parentCommentId, ids.root);
	assert.equal(doc.rootCommentId, ids.root);
});

test("strict schemas reject unknown fields and embedded response trees", () => {
	assert.throws(() => new CommentModel({ ...comment(), replies: [comment()] }), mongoose.Error.StrictModeError);
	assert.throws(() => new CommentVoteModel({ _id: ids.reply, commentId: ids.root, userId: ids.author, value: 1, extra: true }), mongoose.Error.StrictModeError);
	assert.throws(() => new CommentReportModel({ _id: ids.report, commentId: ids.root, reporterId: ids.author, reason: "SPAM", extra: true }), mongoose.Error.StrictModeError);
});

test("vote schema restricts values to positive or negative one", async () => {
	for (const value of [-1, 1]) {
		await new CommentVoteModel({ _id: ids.reply, commentId: ids.root, userId: ids.author, value }).validate();
	}
	for (const value of [-2, 0, 0.5, 2]) {
		await assert.rejects(new CommentVoteModel({ _id: ids.reply, commentId: ids.root, userId: ids.author, value }).validate(), (error: unknown) => error instanceof mongoose.Error.ValidationError && !!error.errors.value);
	}
});

test("report validates reason/status/details without exposing documents through a thread model", async () => {
	const base = { _id: ids.report, commentId: ids.root, reporterId: ids.author, reason: "SPOILER" };
	await new CommentReportModel(base).validate();
	await assert.rejects(new CommentReportModel({ ...base, reason: "INVALID" }).validate(), (error: unknown) => error instanceof mongoose.Error.ValidationError && !!error.errors.reason);
	await assert.rejects(new CommentReportModel({ ...base, status: "INVALID" }).validate(), (error: unknown) => error instanceof mongoose.Error.ValidationError && !!error.errors.status);
	await assert.rejects(new CommentReportModel({ ...base, details: "x".repeat(2001) }).validate(), (error: unknown) => error instanceof mongoose.Error.ValidationError && !!error.errors.details);
});

test("schemas declare stable traversal indexes and unique interaction keys (not database enforcement)", () => {
	const commentKeys = commentSchema.indexes().map(([keys]) => keys);
	assert.ok(commentKeys.some((keys) => JSON.stringify(keys) === JSON.stringify({ targetType: 1, targetId: 1, parentCommentId: 1, createdAt: 1, _id: 1 })));
	assert.ok(commentKeys.some((keys) => JSON.stringify(keys) === JSON.stringify({ rootCommentId: 1, createdAt: 1, _id: 1 })));
	assert.ok(commentVoteSchema.indexes().some(([keys, options]) => keys.commentId === 1 && keys.userId === 1 && options.unique === true));
	assert.ok(commentReportSchema.indexes().some(([keys, options]) => keys.commentId === 1 && keys.reporterId === 1 && options.unique === true));
});
