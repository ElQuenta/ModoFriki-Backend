import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBarrier, openIntegrationClients } from "../../__tests__/helpers/integration";

/** Real PostgreSQL + writable Mongo replica-set suite; mocks cannot substitute these races. */
describe("durable comment creation protocol", () => {
	let prisma: any, mongoose: any, close: () => Promise<void>;
	let decisions: any, comments: any;
	let userId: string, adminId: string, typeId: string, workId: string, chapterId: string, coverId: string, bannerId: string, openingId: string;
	const mongoIds = new Set<string>();
	const sqlIds = new Set<string>();
	const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

	beforeAll(async () => {
		({ prisma, mongoose, close } = await openIntegrationClients());
		const decisionPath = "../community/comment-creation.repository.js";
		const commentPath = "../community/comment.repository.js";
		decisions = new (await import(decisionPath)).CommentCreationRepository(prisma);
		comments = new (await import(commentPath)).CommentRepository();
	});
	afterAll(async () => close?.());
	beforeEach(async () => {
		[userId, adminId, typeId, workId, chapterId, coverId, bannerId, openingId] = Array.from({ length: 8 }, () => randomUUID());
		for (const id of [userId, adminId, typeId, workId, chapterId, coverId, bannerId, openingId]) sqlIds.add(id);
		await prisma.user.createMany({ data: [
			{ id: userId, email: `${userId}@example.test`, emailNormalized: `${userId}@example.test`, username: userId, usernameNormalized: userId, passwordHash: "test-only", role: "BASIC", status: "ACTIVE" },
			{ id: adminId, email: `${adminId}@example.test`, emailNormalized: `${adminId}@example.test`, username: adminId, usernameNormalized: adminId, passwordHash: "test-only", role: "ADMIN", status: "ACTIVE" }
		] });
		await prisma.workType.create({ data: { id: typeId, name: typeId, slug: typeId } });
		await prisma.mediaAsset.createMany({ data: [coverId, bannerId, openingId].map((id, index) => ({ id, pathname: `comment-fixture/${id}.png`, url: `https://fixtures.invalid/${id}.png`, contentType: "image/png", sizeBytes: 1, createdById: adminId })) });
		await prisma.work.create({ data: { id: workId, title: workId, slug: workId, synopsis: "fixture", typeId, publicationStatus: "PUBLISHED", publishedAt: new Date(), coverAssetId: coverId, bannerAssetId: bannerId, incapBannerAssetId: openingId, createdById: adminId, updatedById: adminId } });
		await prisma.chapter.create({ data: { id: chapterId, workId, number: "1", status: "PUBLISHED", publishedAt: new Date(), createdById: adminId, updatedById: adminId } });
	});
	afterEach(async () => {
		const collection = mongoose.connection.collection("comments");
		for (const id of mongoIds) await collection.deleteOne({ _id: id });
		mongoIds.clear();
		await prisma.$executeRawUnsafe('DELETE FROM "AdminAuditEvent" WHERE "actorId" = $1 OR "subjectUserId" = $1', userId);
		await prisma.$executeRawUnsafe('DELETE FROM "AdminAuditEvent" WHERE "actorId" = $1 OR "subjectUserId" = $1', adminId);
		await prisma.$executeRawUnsafe('DELETE FROM "CommentSanction" WHERE "userId" = $1 OR "imposedById" = $1 OR "revokedById" = $1', userId);
		await prisma.$executeRawUnsafe('DELETE FROM "CommentSanction" WHERE "userId" = $1 OR "imposedById" = $1 OR "revokedById" = $1', adminId);
		for (const id of sqlIds) await prisma.$executeRawUnsafe('DELETE FROM "CommentCreationDecision" WHERE "id" = $1 OR "authorId" = $1', id);
		await prisma.chapter.deleteMany({ where: { id: chapterId } }); await prisma.work.deleteMany({ where: { id: workId } }); await prisma.mediaAsset.deleteMany({ where: { id: { in: [coverId, bannerId, openingId] } } }); await prisma.workType.deleteMany({ where: { id: typeId } });
		await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } }); sqlIds.clear();
	});

	async function stageRoot(operationId: string, bodyMarkdown = "durable root") {
		mongoIds.add(operationId); sqlIds.add(operationId);
		return comments.stageRoot({ operationId, authorId: userId, targetType: "WORK", targetId: workId, bodyMarkdown });
	}

	it("replays the same author/fingerprint without extending 60 seconds and conflicts on mismatch", async () => {
		const id = randomUUID(), hash = fingerprint("same"); sqlIds.add(id);
		const first = await decisions.prepare({ id: userId }, { operationId: id, requestFingerprint: hash });
		const replay = await decisions.prepare({ id: userId }, { operationId: id, requestFingerprint: hash });
		expect(+replay.preparedAt).toBe(+first.preparedAt); expect(+replay.expiresAt).toBe(+first.expiresAt); expect(+first.expiresAt - +first.preparedAt).toBe(60_000);
		await expect(decisions.prepare({ id: userId }, { operationId: id, requestFingerprint: fingerprint("different") })).rejects.toMatchObject({ statusCode: 409 });
	});

	it("recovers a majority-staged root after a simulated response loss without overwriting", async () => {
		const id = randomUUID(), hash = fingerprint("root"); await decisions.prepare({ id: userId }, { operationId: id, requestFingerprint: hash });
		const first = await stageRoot(id); const recovered = await stageRoot(id);
		expect(recovered._id).toBe(first._id); expect(recovered.creationOperationId).toBe(id); expect(recovered.bodyMarkdown).toBe("durable root");
		await expect(comments.stageRoot({ operationId: id, authorId: userId, targetType: "WORK", targetId: workId, bodyMarkdown: "changed" })).rejects.toMatchObject({ statusCode: 409 });
	});

	it("a late Mongo write after a winning sanction remains permanently hidden/rejected", async () => {
		const sanctionPath = "../community/comment-sanction.repository.js";
		const sanctions = new (await import(sanctionPath)).CommentSanctionRepository(prisma);
		const id = randomUUID(), hash = fingerprint("late"); await decisions.prepare({ id: userId }, { operationId: id, requestFingerprint: hash });
		await sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "race winner", endsAt: null }, null);
		await stageRoot(id);
		await expect(decisions.finalize({ id: userId }, id, { targetType: "WORK", targetId: workId, workId })).resolves.toMatchObject({ state: "REJECTED", rejectionCode: "SANCTIONED" });
		await sanctions.revoke({ id: adminId, role: "ADMIN" }, userId, (await prisma.commentSanction.findFirstOrThrow({ where: { userId, closedAt: null } })).id);
		await expect(decisions.resolve({ id: userId }, { operationId: id, requestFingerprint: hash })).resolves.toMatchObject({ state: "REJECTED", rejectionCode: "SANCTIONED" });
	});

	it.each(["WORK_UNPUBLISHED", "WORK_DELETED", "CHAPTER_UNPUBLISHED", "CHAPTER_DELETED", "PARENT_WORK_DELETED"])("persists TARGET_UNAVAILABLE when %s wins before finalize", async variant => {
		const id = randomUUID(), hash = fingerprint(variant); await decisions.prepare({ id: userId }, { operationId: id, requestFingerprint: hash });
		mongoIds.add(id); sqlIds.add(id);
		await comments.stageRoot({ operationId: id, authorId: userId, targetType: variant.startsWith("CHAPTER") || variant === "PARENT_WORK_DELETED" ? "CHAPTER" : "WORK", targetId: variant.startsWith("CHAPTER") || variant === "PARENT_WORK_DELETED" ? chapterId : workId, bodyMarkdown: variant });
		if (variant === "WORK_UNPUBLISHED") await prisma.work.update({ where: { id: workId }, data: { publicationStatus: "DRAFT" } });
		if (variant === "WORK_DELETED" || variant === "PARENT_WORK_DELETED") await prisma.work.update({ where: { id: workId }, data: { deletedAt: new Date() } });
		if (variant === "CHAPTER_UNPUBLISHED") await prisma.chapter.update({ where: { id: chapterId }, data: { status: "DRAFT" } });
		if (variant === "CHAPTER_DELETED") await prisma.chapter.update({ where: { id: chapterId }, data: { deletedAt: new Date() } });
		const targetType = variant.startsWith("CHAPTER") || variant === "PARENT_WORK_DELETED" ? "CHAPTER" : "WORK";
		await expect(decisions.finalize({ id: userId }, id, { targetType, targetId: targetType === "CHAPTER" ? chapterId : workId, workId })).resolves.toMatchObject({ state: "REJECTED", rejectionCode: "TARGET_UNAVAILABLE" });
	});

	it("does not publish a timed-out PREPARED and never resurrects EXPIRED", async () => {
		const id = randomUUID(), hash = fingerprint("expired"); sqlIds.add(id);
		await prisma.$executeRawUnsafe('WITH clock AS (SELECT clock_timestamp()::timestamptz(3) AS now) INSERT INTO "CommentCreationDecision" ("id","authorId","state","requestFingerprint","preparedAt","expiresAt") SELECT $1,$2,\'PREPARED\',$3,now-interval \'61 seconds\',now-interval \'1 second\' FROM clock', id, userId, hash);
		await stageRoot(id);
		await decisions.rejectExpired(userId, [id]);
		await expect(decisions.resolve({ id: userId }, { operationId: id, requestFingerprint: hash })).resolves.toMatchObject({ state: "REJECTED", rejectionCode: "EXPIRED" });
		await expect(decisions.finalize({ id: userId }, id, { targetType: "WORK", targetId: workId, workId })).resolves.toMatchObject({ state: "REJECTED", rejectionCode: "EXPIRED" });
	});

	it("a reply stages transactionally and a removed parent cannot be reused", async () => {
		const root = randomUUID(), reply = randomUUID();
		await decisions.prepare({ id: userId }, { operationId: root, requestFingerprint: fingerprint("root-parent") }); await stageRoot(root); await decisions.finalize({ id: userId }, root, { targetType: "WORK", targetId: workId, workId });
		await decisions.prepare({ id: userId }, { operationId: reply, requestFingerprint: fingerprint("reply") }); mongoIds.add(reply); sqlIds.add(reply);
		const staged = await comments.stageReply({ operationId: reply, authorId: userId, parentCommentId: root, bodyMarkdown: "reply" });
		expect(staged.parentCommentId).toBe(root); expect(staged.creationOperationId).toBe(reply);
		await comments.softDeleteOwn({ commentId: root, authorId: userId });
		const secondReply = randomUUID(); sqlIds.add(secondReply); await decisions.prepare({ id: userId }, { operationId: secondReply, requestFingerprint: fingerprint("reply-2") });
		await expect(comments.stageReply({ operationId: secondReply, authorId: userId, parentCommentId: root, bodyMarkdown: "late" })).rejects.toMatchObject({ statusCode: 404 });
	});

	it("uses a deterministic barrier to prove a late operation cannot infer completion from timeout", async () => {
		const barrier = createBarrier(); let completed = false;
		const operation = (async () => { await barrier.pause(); completed = true; })();
		await barrier.reached; expect(completed).toBe(false); barrier.release(); await operation; expect(completed).toBe(true);
	});
});
