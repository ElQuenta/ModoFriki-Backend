import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openIntegrationClients } from "../../__tests__/helpers/integration";

/** Real PostgreSQL suite. Run only through vitest.integration.config.ts against a disposable DB. */
describe("comment sanctions and decision serialization", () => {
	let prisma: any;
	let close: () => Promise<void>;
	let SanctionRepository: new (client?: any) => any;
	let CreationRepository: new (client?: any) => any;
	let sanctions: any;
	let creations: any;
	let adminId: string;
	let userId: string;
	const owned = new Set<string>();

	beforeAll(async () => {
		({ prisma, close } = await openIntegrationClients());
		const sanctionPath = "../community/comment-sanction.repository.js";
		const creationPath = "../community/comment-creation.repository.js";
		SanctionRepository = (await import(sanctionPath)).CommentSanctionRepository;
		CreationRepository = (await import(creationPath)).CommentCreationRepository;
		sanctions = new SanctionRepository(prisma); creations = new CreationRepository(prisma);
	});
	afterAll(async () => close?.());
	beforeEach(async () => {
		adminId = randomUUID(); userId = randomUUID(); owned.add(adminId); owned.add(userId);
		for (const [id, role] of [[adminId, "ADMIN"], [userId, "BASIC"]] as const) {
			await prisma.user.create({ data: { id, email: `${id}@example.test`, emailNormalized: `${id}@example.test`, username: id, usernameNormalized: id, passwordHash: "test-only", role, status: "ACTIVE" } });
		}
	});
	afterEach(async () => {
		for (const id of [...owned]) {
			await prisma.$executeRawUnsafe('DELETE FROM "AdminAuditEvent" WHERE "actorId" = $1 OR "subjectUserId" = $1', id);
			await prisma.$executeRawUnsafe('DELETE FROM "CommentCreationDecision" WHERE "authorId" = $1', id);
			await prisma.$executeRawUnsafe('DELETE FROM "CommentSanction" WHERE "userId" = $1 OR "imposedById" = $1 OR "revokedById" = $1', id);
		}
		for (const id of [...owned].reverse()) await prisma.user.deleteMany({ where: { id } });
		owned.clear();
	});

	it("a winning sanction atomically rejects every PREPARED decision", async () => {
		const ids = [randomUUID(), randomUUID()];
		for (const id of ids) await creations.prepare({ id: userId }, { operationId: id, requestFingerprint: "a".repeat(64) });
		const result = await sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "spam", endsAt: null }, null);
		expect(result.userId).toBe(userId);
		for (const id of ids) await expect(creations.resolve({ id: userId }, { operationId: id, requestFingerprint: "a".repeat(64) })).resolves.toMatchObject({ state: "REJECTED", rejectionCode: "SANCTIONED" });
		const audit = await prisma.adminAuditEvent.findMany({ where: { sanctionId: result.id } });
		expect(audit).toHaveLength(1); expect(audit[0].action).toBe("COMMENT_SANCTION_IMPOSED");
	});

	it("serializes sanction and prepare so no pending permission survives", async () => {
		const operationId = randomUUID();
		const [sanction, preparation] = await Promise.allSettled([
			sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "race", endsAt: null }, null),
			creations.prepare({ id: userId }, { operationId, requestFingerprint: "b".repeat(64) })
		]);
		expect(sanction.status).toBe("fulfilled");
		if (preparation.status === "fulfilled") expect(preparation.value.state).toBe("REJECTED");
		else expect(preparation.reason).toMatchObject({ statusCode: 403 });
		const decision = await creations.resolve({ id: userId }, { operationId, requestFingerprint: "b".repeat(64) });
		if (decision) expect(decision.state).toBe("REJECTED");
	});

	it("closes exact expiry lazily and permits a replacement at the boundary", async () => {
		const endsAt = new Date(Date.now() + 150);
		const first = await sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "short", endsAt }, null);
		await new Promise(resolve => setTimeout(resolve, 200));
		const second = await sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "replacement", endsAt: null }, null);
		const closed = await prisma.commentSanction.findUniqueOrThrow({ where: { id: first.id } });
		expect(+closed.closedAt).toBe(+closed.endsAt); expect(second.id).not.toBe(first.id);
	});

	it("revocation is idempotent by concrete UUID and cannot revoke a later sanction", async () => {
		const first = await sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "one", endsAt: null }, null);
		const revoked = await sanctions.revoke({ id: adminId, role: "ADMIN" }, userId, first.id);
		const replay = await sanctions.revoke({ id: adminId, role: "ADMIN" }, userId, first.id);
		expect(replay.id).toBe(first.id); expect(+replay.revokedAt).toBe(+revoked.revokedAt);
		const later = await sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "two", endsAt: null }, null);
		await sanctions.revoke({ id: adminId, role: "ADMIN" }, userId, first.id);
		expect((await prisma.commentSanction.findUniqueOrThrow({ where: { id: later.id } })).closedAt).toBeNull();
	});

	it("rejects ADMIN targets and evidence owned by another user", async () => {
		await expect(sanctions.impose({ id: adminId, role: "ADMIN" }, adminId, { reason: "invalid", endsAt: null }, null)).rejects.toMatchObject({ statusCode: 403 });
		await expect(sanctions.impose({ id: adminId, role: "ADMIN" }, userId, { reason: "invalid", endsAt: null }, { reference: { type: "COMMENT", id: randomUUID() }, authorId: adminId })).rejects.toMatchObject({ statusCode: 400 });
	});
});
