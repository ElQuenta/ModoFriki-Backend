import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import AppError from "../../src/utils/AppError";
import { actor, admin, communityFixture, ids, record, user } from "./fixtures";

const status = (code: number) => (error: unknown) => error instanceof AppError && error.statusCode === code;
const root = { targetType: "WORK", targetId: ids.work, bodyMarkdown: " **unchanged** " };

test("create preserves Markdown, takes actor identity and hydrates a restricted public author", async () => {
	const f = communityFixture(); const result = await f.service.create(root, actor);
	assert.deepEqual(f.calls.find((c) => c.method === "createRoot")?.input, { authorId: actor.id, ...root });
	assert.deepEqual(result.author, { id: actor.id, username: "Reader" });
	assert.deepEqual(result.votes, { upvotes: 2, downvotes: 1, score: 1 });
	assert.equal(JSON.stringify(result).includes("passwordHash"), false);
	assert.equal(JSON.stringify(result).includes("reporterId"), false);
});

for (const [label, input] of Object.entries({ empty: { ...root, bodyMarkdown: " " }, oversize: { ...root, bodyMarkdown: "x".repeat(10001) },
	injectedAuthor: { ...root, authorId: ids.other }, badTarget: { ...root, targetId: "bad" }, mixedReply: { ...root, parentCommentId: ids.root } })) {
	test(`create rejects ${label} without writing`, async () => {
		const f = communityFixture(); await assert.rejects(f.service.create(input, actor), status(400));
		assert.equal(f.calls.some((c) => c.method.startsWith("create")), false);
	});
}

test("unpublished work or chapter prevents creation and public listing", async () => {
	for (const targetType of ["WORK", "CHAPTER"]) {
		const f = communityFixture(); f.state.published = false;
		await assert.rejects(f.service.create({ ...root, targetType }, actor), status(404));
		await assert.rejects(f.service.list({ targetType, targetId: ids.work }), status(404));
		assert.equal(f.calls.some((c) => c.method === "createRoot"), false);
	}
});

test("reply inherits parent target, allows nested replies, and rejects tombstone", async () => {
	const f = communityFixture(); f.state.comment = record({ _id: ids.reply, parentCommentId: ids.root });
	await f.service.create({ parentCommentId: ids.reply, bodyMarkdown: "reply" }, actor);
	assert.deepEqual(f.calls.find((c) => c.method === "createReply")?.input, { parentCommentId: ids.reply, authorId: actor.id, bodyMarkdown: "reply" });
	f.state.comment.status = "DELETED";
	await assert.rejects(f.service.create({ parentCommentId: ids.reply, bodyMarkdown: "reply" }, actor), status(404));
});

test("listing uses one bounded scope, parsed cursor, batched authors, safe tombstones and absent-author null", async () => {
	const f = communityFixture(); f.state.comment = record({ status: "DELETED", bodyMarkdown: "must disappear" }); f.state.authors = [];
	const result = await f.service.list({ targetType: "WORK", targetId: ids.work, limit: "100", cursorCreatedAt: "2026-10-19T12:00:00Z", cursorId: ids.root });
	assert.equal(result.items[0].bodyMarkdown, null); assert.equal(result.items[0].author, null);
	const input = f.calls.find((c) => c.method === "listRoots")!.input as { limit: number; cursor: { createdAt: Date } };
	assert.equal(input.limit, 100); assert.ok(input.cursor.createdAt instanceof Date);
	assert.equal(f.calls.filter((c) => c.method === "authors").length, 1);
	await f.service.list({ parentCommentId: ids.root }); await f.service.list({ rootCommentId: ids.root });
	assert.ok(f.calls.some((c) => c.method === "listReplies")); assert.ok(f.calls.some((c) => c.method === "listThread"));
});

for (const query of [{}, { targetType: "WORK", targetId: ids.work, parentCommentId: ids.root },
	{ targetType: "WORK", targetId: ids.work, limit: 101 }, { targetType: "WORK", targetId: ids.work, limit: 0 },
	{ targetType: "WORK", targetId: ids.work, cursorId: ids.root },
	{ targetType: "WORK", targetId: ids.work, cursorCreatedAt: "2026-02-31T00:00:00Z", cursorId: ids.root }]) {
	test(`invalid listing ${JSON.stringify(query)} fails before list query`, async () => {
		const f = communityFixture(); await assert.rejects(f.service.list(query), status(400));
		assert.equal(f.calls.some((c) => c.method.startsWith("list")), false);
	});
}

test("only author edits, even ADMIN cannot edit another author, revision reaches repository", async () => {
	const f = communityFixture(); await assert.rejects(f.service.edit(ids.root, { bodyMarkdown: "edit", expectedRevision: 0 }, admin), status(403));
	assert.equal(f.calls.some((c) => c.method === "editOwn"), false);
	const edited = await f.service.edit(ids.root, { bodyMarkdown: "edit", expectedRevision: 3 }, actor);
	assert.equal(edited.revision, 4);
	assert.deepEqual(f.calls.find((c) => c.method === "editOwn")?.input, { commentId: ids.root, authorId: actor.id, bodyMarkdown: "edit", expectedRevision: 3 });
});

test("delete selects owner versus ADMIN persistence, denies EDITOR, allows cleanup of unpublished destination", async () => {
	const f = communityFixture(); f.state.published = false;
	await assert.rejects(f.service.remove(ids.root, { ...admin, role: "EDITOR" }), status(403));
	await f.service.remove(ids.root, actor); await f.service.remove(ids.root, admin);
	assert.ok(f.calls.some((c) => c.method === "softDeleteOwn")); assert.ok(f.calls.some((c) => c.method === "softDeleteAsModerator"));
});

test("votes accept only ±1, require active comment and use authenticated actor", async () => {
	const f = communityFixture(); await assert.rejects(f.service.setVote(ids.root, { value: 0 }, actor), status(400));
	await f.service.setVote(ids.root, { value: -1 }, actor);
	assert.deepEqual(f.calls.find((c) => c.method === "setVote")?.input, { commentId: ids.root, userId: actor.id, value: -1 });
	f.state.comment.status = "DELETED";
	await assert.rejects(f.service.setVote(ids.root, { value: 1 }, actor), status(404));
	await f.service.removeVote(ids.root, actor);
	assert.ok(f.calls.some((c) => c.method === "removeVote"));
});

test("report omits restricted identity, and moderation gates before repository access", async () => {
	const f = communityFixture(); const result = await f.service.report(ids.root, { reason: "SPAM" }, actor);
	assert.equal("reporterId" in result, false);
	await assert.rejects(f.service.listReports({}, actor), status(403));
	await assert.rejects(f.service.resolveReport(ids.report, { status: "RESOLVED", resolution: "done" }, actor), status(403));
	assert.equal(f.calls.some((c) => c.method === "listReports" || c.method === "resolve"), false);
	assert.equal((await f.service.listReports({ status: "OPEN" }, admin)).items[0].reporterId, actor.id);
	const resolved = await f.service.resolveReport(ids.report, { status: "RESOLVED", resolution: "done" }, admin);
	assert.equal(resolved.status, "RESOLVED");
});

test("unexpected repository failure becomes controlled service error without driver data", async () => {
	const f = communityFixture(); f.comments.createRoot = async () => { throw new Error("password=do-not-expose"); };
	await assert.rejects(f.service.create(root, actor), (error: unknown) => status(500)(error) && !(error as Error).message.includes("do-not-expose"));
});
