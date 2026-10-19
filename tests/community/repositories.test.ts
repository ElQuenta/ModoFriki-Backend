import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import AppError from "../../src/utils/AppError";
import { CommentRepository } from "../../src/repositories/community/comment.repository";
import { CommentVoteRepository } from "../../src/repositories/community/comment-vote.repository";
import { CommentReportRepository } from "../../src/repositories/community/comment-report.repository";
import { comment, fixture, ids } from "./fakes";

const errorStatus = (status: number) => (error: unknown) => error instanceof AppError && error.statusCode === status;
const rootInput = { authorId: ids.author, targetType: "WORK" as const, targetId: ids.work, bodyMarkdown: "**Hi** ||spoiler||" };

test("root creation generates its own UUID and preserves original Markdown without accepting extra input fields", async () => {
	const f = fixture();
	const result = await new CommentRepository(f.dependencies).createRoot({ ...rootInput, _id: ids.third, status: "DELETED" } as typeof rootInput);
	assert.match(result._id, /^[0-9a-f-]{14}4[0-9a-f-]{21}$/);
	assert.notEqual(result._id, ids.third);
	assert.equal(result.rootCommentId, result._id);
	assert.equal(result.parentCommentId, null);
	assert.equal(result.status, "ACTIVE");
	assert.equal(result.bodyMarkdown, rootInput.bodyMarkdown);
	assert.deepEqual(f.lifecycle, []);
});

test("invalid root input fails before contacting a model or opening a session", async () => {
	const f = fixture();
	const repository = new CommentRepository(f.dependencies);
	for (const input of [
		{ ...rootInput, authorId: "not-a-uuid" },
		{ ...rootInput, targetId: { $ne: null } },
		{ ...rootInput, targetType: "OTHER" },
		{ ...rootInput, bodyMarkdown: " " },
		{ ...rootInput, bodyMarkdown: "x".repeat(10001) }
	]) await assert.rejects(repository.createRoot(input as typeof rootInput), errorStatus(400));
	assert.deepEqual(f.comments.calls, []);
	assert.deepEqual(f.lifecycle, []);
});

test("reply derives original target and root from active parent and writes in the same transaction", async () => {
	const f = fixture();
	const parent = comment({ _id: ids.reply, targetType: "CHAPTER", parentCommentId: ids.root, revision: 4 });
	f.comments.respond("findOneAndUpdate", parent);
	const order: string[] = [];
	f.comments.onCall = (method) => order.push(method);
	const result = await new CommentRepository(f.dependencies).createReply({ authorId: ids.other, parentCommentId: ids.reply, bodyMarkdown: "reply", targetId: ids.third, rootCommentId: ids.third } as { authorId: string; parentCommentId: string; bodyMarkdown: string });
	assert.equal(result.targetId, ids.work);
	assert.equal(result.targetType, "CHAPTER");
	assert.equal(result.rootCommentId, ids.root);
	assert.equal(result.parentCommentId, ids.reply);
	assert.notEqual(result._id, ids.reply);
	assert.deepEqual(f.comments.args("findOneAndUpdate"), [
		{ _id: ids.reply, status: "ACTIVE" }, { $inc: { revision: 1 } },
		{ new: true, runValidators: true, session: f.session }
	]);
	assert.deepEqual(f.comments.args("create")[1], { session: f.session });
	assert.ok(order.indexOf("findOneAndUpdate") < order.indexOf("create"));
	assert.deepEqual(f.lifecycle, ["start", "transaction", "commit", "end"]);
});

test("missing/deleted parent prevents reply insertion and always ends transaction session", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", null);
	await assert.rejects(new CommentRepository(f.dependencies).createReply({ authorId: ids.author, parentCommentId: ids.root, bodyMarkdown: "reply" }), errorStatus(404));
	assert.equal(f.comments.calls.some((call) => call.method === "create"), false);
	assert.deepEqual(f.lifecycle, ["start", "transaction", "abort", "end"]);
});

test("reply insertion failure rejects the transaction and hides raw driver details", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", comment()).respond("create", new Error("secret mongodb://credentials private body"));
	await assert.rejects(new CommentRepository(f.dependencies).createReply({ authorId: ids.author, parentCommentId: ids.root, bodyMarkdown: "reply" }), (error: unknown) => {
		assert.ok(error instanceof AppError);
		assert.equal(error.statusCode, 500);
		assert.doesNotMatch(error.message, /secret|credentials|private body/);
		return true;
	});
	assert.deepEqual(f.lifecycle, ["start", "transaction", "abort", "end"]);
});

test("pagination bounds the query and constructs a lexicographic timestamp/UUID cursor filter", async () => {
	const f = fixture();
	const first = comment({ _id: ids.reply });
	const second = comment({ _id: ids.third });
	const extra = comment({ _id: "30000000-0000-4000-8000-000000000004" });
	f.comments.respond("find", [first, second, extra]);
	const cursor = { createdAt: first.createdAt, id: ids.root };
	const result = await new CommentRepository(f.dependencies).listRoots({ targetType: "WORK", targetId: ids.work, limit: 2, cursor });
	assert.deepEqual(result, { items: [first, second], hasMore: true, nextCursor: { createdAt: second.createdAt, id: ids.third } });
	assert.deepEqual(f.comments.args("find"), [{ targetType: "WORK", targetId: ids.work, parentCommentId: null, $or: [
		{ createdAt: { $gt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $gt: ids.root } }
	] }]);
	assert.deepEqual(f.comments.args("sort"), [{ createdAt: 1, _id: 1 }]);
	assert.deepEqual(f.comments.args("limit"), [3]);
});

test("reply and thread listings query only their explicit scope and return no cursor at the end", async () => {
	const f = fixture();
	f.comments.respond("find", [], [comment()]);
	const repository = new CommentRepository(f.dependencies);
	assert.deepEqual(await repository.listReplies({ parentCommentId: ids.root, limit: 10 }), { items: [], hasMore: false, nextCursor: null });
	assert.deepEqual(f.comments.args("find"), [{ parentCommentId: ids.root }]);
	assert.equal((await repository.listThread({ rootCommentId: ids.root, limit: 10 })).nextCursor, null);
	assert.deepEqual(f.comments.args("find", 1), [{ rootCommentId: ids.root }]);
});

test("invalid pagination and cursors are rejected before a database query", async () => {
	const f = fixture();
	const repository = new CommentRepository(f.dependencies);
	for (const limit of [0, -1, 101, 1.5, NaN, Infinity]) {
		await assert.rejects(repository.listRoots({ targetType: "WORK", targetId: ids.work, limit }), errorStatus(400));
	}
	for (const cursor of [{ createdAt: new Date(NaN), id: ids.root }, { createdAt: new Date(), id: "bad" }, { createdAt: "2026-10-19", id: ids.root }, null]) {
		await assert.rejects(repository.listReplies({ parentCommentId: ids.root, limit: 10, cursor } as Parameters<typeof repository.listReplies>[0]), errorStatus(400));
	}
	assert.deepEqual(f.comments.calls, []);
});

test("findById normalizes canonical UUID and returns null for an absent record", async () => {
	const f = fixture();
	f.comments.respond("findById", null);
	const mixedCase = "abc00000-0000-7000-8000-000000000001";
	assert.equal(await new CommentRepository(f.dependencies).findById(mixedCase.toUpperCase()), null);
	assert.deepEqual(f.comments.args("findById"), [mixedCase]);
});

test("editing conditions the write on owner, active state and exact revision and updates only content", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", comment({ revision: 3 }));
	await new CommentRepository(f.dependencies).editOwn({ commentId: ids.root, authorId: ids.author, bodyMarkdown: "new", expectedRevision: 2 });
	const [filter, update, options] = f.comments.args("findOneAndUpdate") as [unknown, { $set: Record<string, unknown>; $inc: unknown }, unknown];
	assert.deepEqual(filter, { _id: ids.root, authorId: ids.author, status: "ACTIVE", revision: 2 });
	assert.deepEqual(Object.keys(update.$set).sort(), ["bodyMarkdown", "editedAt"]);
	assert.equal(update.$set.bodyMarkdown, "new");
	assert.ok(update.$set.editedAt instanceof Date);
	assert.deepEqual(update.$inc, { revision: 1 });
	assert.deepEqual(options, { new: true, runValidators: true });
});

test("stale/not-owned edit conflicts; invalid revision is rejected before persistence", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", null);
	const repository = new CommentRepository(f.dependencies);
	await assert.rejects(repository.editOwn({ commentId: ids.root, authorId: ids.other, bodyMarkdown: "new", expectedRevision: 0 }), errorStatus(409));
	for (const expectedRevision of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
		await assert.rejects(repository.editOwn({ commentId: ids.root, authorId: ids.author, bodyMarkdown: "new", expectedRevision }), errorStatus(400));
	}
	assert.equal(f.comments.calls.filter((call) => call.method === "findOneAndUpdate").length, 1);
});

test("own deletion writes a tombstone with ownership predicate and leaves the tree untouched", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", comment({ status: "DELETED", bodyMarkdown: null }));
	await new CommentRepository(f.dependencies).softDeleteOwn({ commentId: ids.root, authorId: ids.author });
	const [filter, update] = f.comments.args("findOneAndUpdate") as [unknown, { $set: Record<string, unknown>; $inc: unknown }];
	assert.deepEqual(filter, { _id: ids.root, status: "ACTIVE", authorId: ids.author });
	assert.equal(update.$set.bodyMarkdown, null);
	assert.equal(update.$set.status, "DELETED");
	assert.equal(update.$set.deletedById, ids.author);
	assert.ok(update.$set.deletedAt instanceof Date);
	assert.deepEqual(update.$inc, { revision: 1 });
	assert.equal("parentCommentId" in update.$set, false);
	assert.equal("rootCommentId" in update.$set, false);
	assert.equal(f.comments.calls.some((call) => call.method === "deleteOne"), false);
});

test("explicit moderator deletion records actor without owner restriction; unavailable active record is 404", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", comment(), null);
	const repository = new CommentRepository(f.dependencies);
	await repository.softDeleteAsModerator({ commentId: ids.root, moderatorId: ids.other });
	assert.deepEqual(f.comments.args("findOneAndUpdate")[0], { _id: ids.root, status: "ACTIVE" });
	const update = f.comments.args("findOneAndUpdate")[1] as { $set: { deletedById: string } };
	assert.equal(update.$set.deletedById, ids.other);
	await assert.rejects(repository.softDeleteOwn({ commentId: ids.root, authorId: ids.author }), errorStatus(404));
});

test("vote replacement touches active comment and upserts one user/comment key in the same transaction", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", comment());
	f.votes.respond("findOneAndUpdate", { commentId: ids.root, userId: ids.author, value: -1 });
	await new CommentVoteRepository(f.dependencies).setVote({ commentId: ids.root, userId: ids.author, value: -1 });
	assert.deepEqual(f.comments.args("findOneAndUpdate")[0], { _id: ids.root, status: "ACTIVE" });
	const [filter, update, options] = f.votes.args("findOneAndUpdate") as [unknown, { $set: unknown; $setOnInsert: Record<string, unknown> }, unknown];
	assert.deepEqual(filter, { commentId: ids.root, userId: ids.author });
	assert.deepEqual(update.$set, { value: -1 });
	assert.equal(update.$setOnInsert.commentId, ids.root);
	assert.equal(update.$setOnInsert.userId, ids.author);
	assert.deepEqual(options, { upsert: true, new: true, runValidators: true, session: f.session });
	assert.deepEqual(f.lifecycle, ["start", "transaction", "commit", "end"]);
});

test("invalid vote fails early; deleted comment prevents voting", async () => {
	const f = fixture();
	const repository = new CommentVoteRepository(f.dependencies);
	for (const value of [0, 2, "1", null]) {
		await assert.rejects(repository.setVote({ commentId: ids.root, userId: ids.author, value } as Parameters<typeof repository.setVote>[0]), errorStatus(400));
	}
	assert.deepEqual(f.lifecycle, []);
	f.comments.respond("findOneAndUpdate", null);
	await assert.rejects(repository.setVote({ commentId: ids.root, userId: ids.author, value: 1 }), errorStatus(404));
	assert.deepEqual(f.votes.calls, []);
});

test("vote removal is idempotent and remains possible after a comment was deleted", async () => {
	const f = fixture();
	f.votes.respond("deleteOne", { deletedCount: 1 }, { deletedCount: 0 });
	const repository = new CommentVoteRepository(f.dependencies);
	assert.equal(await repository.removeVote({ commentId: ids.root, userId: ids.author }), true);
	assert.equal(await repository.removeVote({ commentId: ids.root, userId: ids.author }), false);
	assert.deepEqual(f.comments.calls, []);
	assert.deepEqual(f.votes.args("deleteOne"), [{ commentId: ids.root, userId: ids.author }, { session: f.session }]);
});

test("vote summaries use a single bounded aggregate, deduplicate IDs and fill zeros in requested order", async () => {
	const f = fixture();
	f.votes.respond("aggregate", [{ _id: ids.reply, upvotes: 3, downvotes: 1, score: 2 }]);
	const result = await new CommentVoteRepository(f.dependencies).getSummaries([ids.root, ids.reply, ids.root]);
	assert.deepEqual(result, [
		{ commentId: ids.root, upvotes: 0, downvotes: 0, score: 0 },
		{ commentId: ids.reply, upvotes: 3, downvotes: 1, score: 2 }
	]);
	const pipeline = f.votes.args("aggregate")[0] as unknown[];
	assert.deepEqual(pipeline[0], { $match: { commentId: { $in: [ids.root, ids.reply] } } });
	assert.equal(f.votes.calls.filter((call) => call.method === "aggregate").length, 1);
});

test("empty summaries avoid a query; large, malformed and sparse batches are rejected", async () => {
	const f = fixture();
	const repository = new CommentVoteRepository(f.dependencies);
	assert.deepEqual(await repository.getSummaries([]), []);
	for (const input of [Array(101).fill(ids.root), ["bad"], Array(2), null]) {
		await assert.rejects(repository.getSummaries(input as string[]), errorStatus(400));
	}
	assert.deepEqual(f.votes.calls, []);
});

test("report creation touches active comment and inserts restricted report with same session", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", comment());
	const result = await new CommentReportRepository(f.dependencies).create({ commentId: ids.root, reporterId: ids.other, reason: "SPOILER", details: "Hidden reveal" });
	assert.equal(result.status, "OPEN");
	assert.equal(result.details, "Hidden reveal");
	assert.equal(result.commentId, ids.root);
	assert.equal(result.reporterId, ids.other);
	assert.deepEqual(f.reports.args("create")[1], { session: f.session });
	assert.deepEqual(f.lifecycle, ["start", "transaction", "commit", "end"]);
});

test("invalid report input is rejected before opening a transaction", async () => {
	const f = fixture();
	const repository = new CommentReportRepository(f.dependencies);
	const input = { commentId: ids.root, reporterId: ids.author, reason: "SPAM" as const };
	for (const candidate of [{ ...input, reason: "INVALID" }, { ...input, details: " " }, { ...input, details: "x".repeat(2001) }]) {
		await assert.rejects(repository.create(candidate as typeof input), errorStatus(400));
	}
	assert.deepEqual(f.lifecycle, []);
});

test("a report cannot be created on a missing/deleted comment", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", null);
	await assert.rejects(new CommentReportRepository(f.dependencies).create({ commentId: ids.root, reporterId: ids.author, reason: "SPAM" }), errorStatus(404));
	assert.deepEqual(f.reports.calls, []);
	assert.deepEqual(f.lifecycle, ["start", "transaction", "abort", "end"]);
});

test("duplicate report maps to conflict and closes the failed transaction", async () => {
	const f = fixture();
	f.comments.respond("findOneAndUpdate", comment());
	f.reports.respond("create", Object.assign(new Error("private duplicate reporter"), { code: 11000 }));
	await assert.rejects(new CommentReportRepository(f.dependencies).create({ commentId: ids.root, reporterId: ids.author, reason: "SPAM" }), errorStatus(409));
	assert.deepEqual(f.lifecycle, ["start", "transaction", "abort", "end"]);
});

test("moderation listing scopes status, bounds records and includes stable cursor", async () => {
	const f = fixture();
	f.reports.respond("find", []);
	const at = new Date("2026-10-19T00:00:00Z");
	await new CommentReportRepository(f.dependencies).listForModeration({ status: "OPEN", limit: 20, cursor: { createdAt: at, id: ids.report } });
	assert.deepEqual(f.reports.args("find"), [{ status: "OPEN", $or: [
		{ createdAt: { $gt: at } }, { createdAt: at, _id: { $gt: ids.report } }
	] }]);
	assert.deepEqual(f.reports.args("limit"), [21]);
});

test("moderator resolution records actor and refuses to overwrite an already closed report", async () => {
	const f = fixture();
	f.reports.respond("findOneAndUpdate", { _id: ids.report, status: "RESOLVED" }, null);
	const repository = new CommentReportRepository(f.dependencies);
	const input = { reportId: ids.report, moderatorId: ids.other, status: "RESOLVED" as const, resolution: "Handled" };
	await repository.resolveAsModerator(input);
	const [filter, update] = f.reports.args("findOneAndUpdate") as [unknown, { $set: Record<string, unknown> }];
	assert.deepEqual(filter, { _id: ids.report, status: { $in: ["OPEN", "IN_REVIEW"] } });
	assert.equal(update.$set.reviewedById, ids.other);
	assert.equal(update.$set.resolution, "Handled");
	assert.ok(update.$set.reviewedAt instanceof Date);
	await assert.rejects(repository.resolveAsModerator(input), errorStatus(409));
	await assert.rejects(repository.resolveAsModerator({ ...input, resolution: " " }), errorStatus(400));
});

test("session startup failure is controlled and has no fallback write outside a transaction", async () => {
	const f = fixture();
	f.dependencies.startSession = async () => { throw new Error("standalone private connection"); };
	await assert.rejects(new CommentVoteRepository(f.dependencies).setVote({ commentId: ids.root, userId: ids.author, value: 1 }), errorStatus(500));
	assert.deepEqual(f.comments.calls, []);
	assert.deepEqual(f.votes.calls, []);
});

test("mongoose validation/cast errors and duplicate keys have safe distinct status mappings", async () => {
	for (const [failure, status] of [
		[new mongoose.Error.ValidationError(), 400],
		[new mongoose.Error.CastError("String", "sensitive-value", "private-field"), 400],
		[Object.assign(new Error("private key"), { code: 11000 }), 409]
	] as const) {
		const f = fixture();
		f.comments.respond("findById", failure);
		await assert.rejects(new CommentRepository(f.dependencies).findById(ids.root), (error: unknown) => {
			assert.ok(error instanceof AppError);
			assert.equal(error.statusCode, status);
			assert.doesNotMatch(error.message, /sensitive-value|private-field|private key/);
			return true;
		});
	}
});
