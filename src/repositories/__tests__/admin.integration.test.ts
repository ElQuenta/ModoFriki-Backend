import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { integrationEnvironment } from "../../../test-support/integration-environment";
import { createBarrier } from "../../__tests__/helpers/fixtures";
import type { PrismaClient, User } from "../../generated/prisma/client";
import type { AdminActor } from "../../types/admin.types";

/** Run with vitest.integration.config.ts after migrations on a disposable loopback DB.
 * Only SQL is connected: Mongo's URL is validated by the common config, never opened.
 * Failure injection below throws inside a real SQL transaction; it is not an atomicity mock.
 */
describe("AdminRepository real SQL US1", () => {
	let prisma: PrismaClient;
	let Repository: typeof import("../auth/admin.repository.js").AdminRepository;
	let WorkRepository: typeof import("../catalog/work.repository.js").WorkRepository;
	let repository: InstanceType<typeof Repository>;
	let admin: User;
	let editor: User;
	let actor: AdminActor;
	let workId: string;
	let typeId: string;
	let runId: string;
	const ownedUsers: string[] = [];
	const ownedWorks: string[] = [];

	beforeAll(async () => {
		const env = integrationEnvironment(process.env);
		if (process.env.NODE_ENV !== "test" || process.env.DATABASE_URL !== env.DATABASE_URL) throw new Error("Verified disposable SQL configuration is required");
		prisma = (await import("../../config/database/postgres.js")).default as unknown as PrismaClient;
		Repository = (await import("../auth/admin.repository.js")).AdminRepository;
		WorkRepository = (await import("../catalog/work.repository.js")).WorkRepository;
		await prisma.$connect();
		await prisma.$queryRaw`SELECT 1`;
		repository = new Repository(prisma);
	});
	afterAll(async () => { await prisma?.$disconnect(); });

	async function createUser(role: "ADMIN" | "EDITOR" | "BASIC", status: "ACTIVE" | "SUSPENDED" | "DELETED" = "ACTIVE", createdAt?: Date) {
		const id = randomUUID();
		const user = await prisma.user.create({ data: { id, email: `${id}@example.test`, emailNormalized: `${id}@example.test`, username: id, usernameNormalized: id, passwordHash: "unit-test-not-a-real-password", role, status, ...(status === "DELETED" ? { deletedAt: new Date() } : {}), ...(createdAt ? { createdAt } : {}) } });
		ownedUsers.push(id);
		return user;
	}
	async function createWork() {
		const id = randomUUID();
		await prisma.work.create({ data: { id, title: `test-${id}`, slug: `test-${id}`, synopsis: "isolated fixture", typeId, createdById: admin.id, updatedById: admin.id } });
		ownedWorks.push(id);
		return id;
	}
	beforeEach(async () => {
		runId = randomUUID();
		admin = await createUser("ADMIN"); editor = await createUser("EDITOR"); actor = { id: admin.id, role: "ADMIN" };
		typeId = randomUUID();
		await prisma.workType.create({ data: { id: typeId, name: runId, slug: runId } });
		workId = await createWork();
	});
	afterEach(async () => {
		// Select fixture descendants by owned identities, then delete each exact PK.
		if (!prisma) return;
		const audits = await prisma.adminAuditEvent.findMany({ where: { actorId: { in: ownedUsers } }, select: { id: true } });
		for (const row of audits) await prisma.adminAuditEvent.delete({ where: { id: row.id } });
		const relations = await prisma.workEditorAssignment.findMany({ where: { editorId: { in: ownedUsers } }, select: { id: true } });
		for (const row of relations) await prisma.workEditorAssignment.delete({ where: { id: row.id } });
		for (const id of ownedWorks.splice(0)) await prisma.work.delete({ where: { id } });
		if (typeId) await prisma.workType.delete({ where: { id: typeId } });
		for (const id of ownedUsers.splice(0).reverse()) await prisma.user.delete({ where: { id } });
	});
	const events = () => prisma.adminAuditEvent.findMany({ where: { actorId: admin.id }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });

	it("role no-op has no audit/timestamp mutation; stale CAS is 409 even for same role", async () => {
		const same = await repository.changeRole(actor, editor.id, { role: "EDITOR", expectedUpdatedAt: editor.updatedAt });
		expect(+same.updatedAt).toBe(+editor.updatedAt);
		expect(await events()).toHaveLength(0);
		await expect(repository.changeRole(actor, editor.id, { role: "EDITOR", expectedUpdatedAt: new Date(+editor.updatedAt - 1) })).rejects.toMatchObject({ statusCode: 409 });
		expect(await events()).toHaveLength(0);
	});

	it("downgrade revokes every live assignment, increments versions and audits atomically", async () => {
		const secondWork = await createWork();
		const a = await repository.assign(actor, editor.id, workId, { expectedVersion: 0 });
		const b = await repository.assign(actor, editor.id, secondWork, { expectedVersion: 0 });
		await prisma.user.update({ where: { id: editor.id }, data: { status: "SUSPENDED", updatedAt: editor.updatedAt } });
		const changed = await repository.changeRole(actor, editor.id, { role: "BASIC", expectedUpdatedAt: editor.updatedAt });
		expect(changed.status).toBe("SUSPENDED");
		expect(+changed.updatedAt).toBeGreaterThan(+editor.updatedAt);
		const relations = await prisma.workEditorAssignment.findMany({ where: { editorId: editor.id } });
		expect(relations).toHaveLength(2);
		for (const row of relations) { expect(row.revokedAt).toBeInstanceOf(Date); expect(row.version).toBe(2); }
		const audit = await events();
		expect(audit.filter(e => e.action === "ROLE_CHANGED")).toHaveLength(1);
		expect(audit.filter(e => e.action === "EDITOR_REVOKED").map(e => e.workId).sort()).toEqual([workId, secondWork].sort());
		await repository.changeRole(actor, editor.id, { role: "EDITOR", expectedUpdatedAt: changed.updatedAt });
		expect(await prisma.workEditorAssignment.count({ where: { id: { in: [a.id, b.id] }, revokedAt: null } })).toBe(0);
	});

	it("reuses assignment identity/createdAt, rejects stale revocation after reassignment", async () => {
		const first = await repository.assign(actor, editor.id, workId, { expectedVersion: 0 });
		const noop = await repository.assign(actor, editor.id, workId, { expectedVersion: 1 });
		expect(noop.version).toBe(1); expect(await events()).toHaveLength(1);
		await expect(repository.assign(actor, editor.id, workId, { expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 409 });
		const revoked = await repository.revoke(actor, editor.id, workId, { expectedVersion: 1 });
		expect(revoked.version).toBe(2);
		await repository.revoke(actor, editor.id, workId, { expectedVersion: 2 });
		expect(await events()).toHaveLength(2);
		const reassigned = await repository.assign(actor, editor.id, workId, { expectedVersion: 2 });
		expect(reassigned.id).toBe(first.id); expect(+reassigned.createdAt).toBe(+first.createdAt); expect(reassigned.version).toBe(3);
		await expect(repository.revoke(actor, editor.id, workId, { expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
		expect((await prisma.workEditorAssignment.findUniqueOrThrow({ where: { id: first.id } })).revokedAt).toBeNull();
		expect(await events()).toHaveLength(3);
	});

	it("allows revoking a suspended editor but forbids assigning them", async () => {
		await repository.assign(actor, editor.id, workId, { expectedVersion: 0 });
		await prisma.user.update({ where: { id: editor.id }, data: { status: "SUSPENDED" } });
		await expect(repository.assign(actor, editor.id, workId, { expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
		expect((await repository.revoke(actor, editor.id, workId, { expectedVersion: 1 })).revokedAt).toBeInstanceOf(Date);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: editor.id } })).status).toBe("SUSPENDED");
	});

	it("revalidates the current SQL actor even when its authenticated hint says ADMIN", async () => {
		await prisma.user.update({ where: { id: admin.id }, data: { role: "BASIC" } });
		await expect(repository.changeRole(actor, editor.id, { role: "BASIC", expectedUpdatedAt: editor.updatedAt })).rejects.toMatchObject({ statusCode: 403 });
		await expect(repository.listUsers(actor, {})).rejects.toMatchObject({ statusCode: 403 });
		await expect(repository.findUser(actor, editor.id)).rejects.toMatchObject({ statusCode: 403 });
		expect(await events()).toHaveLength(0);
	});

	it.each(["SUSPENDED", "DELETED"] as const)("rejects %s SQL actor for reads and mutations", async status => {
		await prisma.user.update({ where: { id: admin.id }, data: { status, ...(status === "DELETED" ? { deletedAt: new Date() } : {}) } });
		await expect(repository.listAssignments(actor, editor.id, {})).rejects.toMatchObject({ statusCode: 403 });
		await expect(repository.assign(actor, editor.id, workId, { expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 403 });
	});

	it("protects both ADMIN subjects and hides deleted users", async () => {
		const other = await createUser("ADMIN"); const deleted = await createUser("BASIC", "DELETED");
		for (const subject of [admin, other]) await expect(repository.changeRole(actor, subject.id, { role: "BASIC", expectedUpdatedAt: subject.updatedAt })).rejects.toMatchObject({ statusCode: 403 });
		expect(await repository.findUser(actor, deleted.id)).toBeNull();
		await expect(repository.changeRole(actor, deleted.id, { role: "EDITOR", expectedUpdatedAt: deleted.updatedAt })).rejects.toMatchObject({ statusCode: 404 });
	});

	it("uses SQL clock or prior+1ms, even with an updatedAt ahead of SQL time", async () => {
		const future = new Date("2099-01-01T00:00:00.000Z");
		await prisma.user.update({ where: { id: editor.id }, data: { updatedAt: future } });
		const changed = await repository.changeRole(actor, editor.id, { role: "BASIC", expectedUpdatedAt: future });
		expect(+changed.updatedAt).toBe(+future + 1);
	});

	it("keyset traversal has no duplicates/omissions for tied user timestamps and excludes DELETED", async () => {
		const tied = new Date("2000-01-01T00:00:00.000Z");
		const users = [await createUser("BASIC", "ACTIVE", tied), await createUser("BASIC", "SUSPENDED", tied), await createUser("BASIC", "ACTIVE", tied)];
		const deleted = await createUser("BASIC", "DELETED", tied);
		let cursor: { createdAt: Date; id: string } | undefined;
		const seen: string[] = [];
		for (let page = 0; page < 100; page++) {
			const result = await repository.listUsers(actor, { role: "BASIC", limit: 1, ...(cursor ? { cursor } : {}) });
			expect(result.items.length).toBeLessThanOrEqual(1);
			for (const row of result.items) { expect(Object.keys(row).sort()).toEqual(["id", "username", "role", "status", "createdAt", "updatedAt"].sort()); seen.push(row.id); }
			if (!result.hasMore) { expect(result.nextCursor).toBeNull(); break; }
			expect(result.nextCursor).not.toBeNull(); cursor = result.nextCursor!;
		}
		expect(new Set(seen).size).toBe(seen.length); expect(seen).not.toContain(deleted.id);
		expect(seen.filter(id => users.some(u => u.id === id))).toEqual(users.map(u => u.id).sort());
	});

	it("assignment traversal uses immutable createdAt/id when assignedAt changes", async () => {
		const ids = [workId, await createWork(), await createWork()];
		const rows = [];
		for (const id of ids) rows.push(await repository.assign(actor, editor.id, id, { expectedVersion: 0 }));
		const tied = new Date("2000-01-01T00:00:00.000Z");
		for (const row of rows) await prisma.workEditorAssignment.update({ where: { id: row.id }, data: { createdAt: tied } });
		const first = await repository.listAssignments(actor, editor.id, { limit: 1, includeRevoked: true });
		await repository.revoke(actor, editor.id, first.items[0].workId, { expectedVersion: 1 });
		await repository.assign(actor, editor.id, first.items[0].workId, { expectedVersion: 2 });
		const second = await repository.listAssignments(actor, editor.id, { limit: 1, includeRevoked: true, cursor: first.nextCursor! });
		const third = await repository.listAssignments(actor, editor.id, { limit: 1, includeRevoked: true, cursor: second.nextCursor! });
		expect([first.items[0].id, second.items[0].id, third.items[0].id]).toEqual(rows.map(r => r.id).sort());
		expect(third.hasMore).toBe(false); expect(third.nextCursor).toBeNull();
	});

	it("audit insertion failure rolls back role, revocations, versions and updatedAt", async () => {
		const relation = await repository.assign(actor, editor.id, workId, { expectedVersion: 0 });
		// Actual database mutation occurs, then an injected audit error aborts its transaction.
		const failing = prisma.$extends({ query: { adminAuditEvent: {
			async create() { throw new Error("injected audit unavailable"); },
			async createMany() { throw new Error("injected audit unavailable"); }
		} } });
		await expect(new Repository(failing as unknown as PrismaClient).changeRole(actor, editor.id, { role: "BASIC", expectedUpdatedAt: editor.updatedAt })).rejects.toBeDefined();
		const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: editor.id } });
		expect(unchanged.role).toBe("EDITOR"); expect(+unchanged.updatedAt).toBe(+editor.updatedAt);
		const unchangedAssignment = await prisma.workEditorAssignment.findUniqueOrThrow({ where: { id: relation.id } });
		expect(unchangedAssignment.revokedAt).toBeNull(); expect(unchangedAssignment.version).toBe(1);
		expect(await events()).toHaveLength(1);
	});

	it("serializes concurrent CAS changes: exactly one commits and one is stale", async () => {
		const results = await Promise.allSettled([
			repository.changeRole(actor, editor.id, { role: "BASIC", expectedUpdatedAt: editor.updatedAt }),
			repository.changeRole(actor, editor.id, { role: "BASIC", expectedUpdatedAt: editor.updatedAt })
		]);
		expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
		const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult;
		expect(failure.reason).toMatchObject({ statusCode: 409 });
		expect((await events()).filter(e => e.action === "ROLE_CHANGED")).toHaveLength(1);
	});

	it("a winning downgrade blocks a catalog save and the late edit is rejected", async () => {
		await repository.assign(actor, editor.id, workId, { expectedVersion: 0 });
		const currentWork = await prisma.work.findUniqueOrThrow({ where: { id: workId } });
		const barrier = createBarrier();
		let pauseTarget = true;
		const pausing = prisma.$extends({ query: { user: {
			async update({ args, query }) {
				if (pauseTarget && args.where.id === editor.id) {
					pauseTarget = false;
					await barrier.pause();
				}
				return query(args);
			}
		} } });
		const downgrade = new Repository(pausing as unknown as PrismaClient)
			.changeRole(actor, editor.id, { role: "BASIC", expectedUpdatedAt: editor.updatedAt });

		await barrier.reached;
		const save = new WorkRepository(prisma).save({
			actor: { id: editor.id, role: "EDITOR" }, workId,
			data: { title: "late edit must not commit" }, expectedUpdatedAt: currentWork.updatedAt
		}).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));

		try {
			const deadline = Date.now() + 5_000;
			let waiting = false;
			while (!waiting && Date.now() < deadline) {
				const [state] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
					SELECT EXISTS (
						SELECT 1 FROM pg_stat_activity
						WHERE pid <> pg_backend_pid() AND datname = current_database()
						AND wait_event_type = 'Lock' AND query LIKE '%FROM "User"%' AND query LIKE '%FOR UPDATE%'
					) AS waiting`;
				waiting = state?.waiting ?? false;
				if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
			}
			expect(waiting).toBe(true);
		} finally {
			barrier.release();
		}

		await expect(downgrade).resolves.toMatchObject({ role: "BASIC" });
		const saveResult = await save;
		expect(saveResult.ok).toBe(false);
		if (!saveResult.ok) expect(saveResult.error).toMatchObject({ statusCode: 403 });
		expect((await prisma.work.findUniqueOrThrow({ where: { id: workId } })).title).toBe(currentWork.title);
		expect(await prisma.workEditorAssignment.findFirst({ where: { editorId: editor.id, workId, revokedAt: null } })).toBeNull();
	});

	it("a winning revocation blocks a catalog save and the late edit is rejected", async () => {
		await repository.assign(actor, editor.id, workId, { expectedVersion: 0 });
		const currentWork = await prisma.work.findUniqueOrThrow({ where: { id: workId } });
		const barrier = createBarrier();
		let pauseTarget = true;
		const pausing = prisma.$extends({ query: { workEditorAssignment: {
			async update({ args, query }) {
				if (pauseTarget) {
					pauseTarget = false;
					await barrier.pause();
				}
				return query(args);
			}
		} } });
		const revocation = new Repository(pausing as unknown as PrismaClient)
			.revoke(actor, editor.id, workId, { expectedVersion: 1 });

		await barrier.reached;
		const save = new WorkRepository(prisma).save({
			actor: { id: editor.id, role: "EDITOR" }, workId,
			data: { title: "revoked late edit must not commit" }, expectedUpdatedAt: currentWork.updatedAt
		}).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));

		try {
			const deadline = Date.now() + 5_000;
			let waiting = false;
			while (!waiting && Date.now() < deadline) {
				const [state] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
					SELECT EXISTS (
						SELECT 1 FROM pg_stat_activity
						WHERE pid <> pg_backend_pid() AND datname = current_database()
						AND wait_event_type = 'Lock' AND query LIKE '%FROM "User"%' AND query LIKE '%FOR UPDATE%'
					) AS waiting`;
				waiting = state?.waiting ?? false;
				if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
			}
			expect(waiting).toBe(true);
		} finally {
			barrier.release();
		}

		await expect(revocation).resolves.toMatchObject({ version: 2, revokedAt: expect.any(Date) });
		const saveResult = await save;
		expect(saveResult.ok).toBe(false);
		if (!saveResult.ok) expect(saveResult.error).toMatchObject({ statusCode: 403 });
		expect((await prisma.work.findUniqueOrThrow({ where: { id: workId } })).title).toBe(currentWork.title);
	});
});
