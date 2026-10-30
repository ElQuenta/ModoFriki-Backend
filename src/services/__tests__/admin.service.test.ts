import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/auth/admin.repository", () => ({ adminRepository: {} }));

import { AdminService } from "../auth/admin.service";
import type { AdminActor, AdminRepositoryContract, AdminUserRecord, AssignmentRecord } from "../../types/admin.types";
import AppError from "../../utils/AppError";

const actor: AdminActor = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" };
const userId = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";
const time = new Date("2026-10-30T12:00:00.000Z");
const user = (overrides: Partial<AdminUserRecord> = {}): AdminUserRecord => ({ id: userId, username: "editor", role: "EDITOR", status: "ACTIVE", createdAt: time, updatedAt: time, ...overrides });
const assignment = (overrides: Partial<AssignmentRecord> = {}): AssignmentRecord => ({ id: "44444444-4444-4444-8444-444444444444", editorId: userId, workId, assignedById: actor.id, createdAt: time, assignedAt: time, revokedAt: null, version: 1, ...overrides });
const fakeRepository = () => ({ listUsers: vi.fn(), findUser: vi.fn(), changeRole: vi.fn(), listAssignments: vi.fn(), assign: vi.fn(), revoke: vi.fn() });

describe("AdminService US1", () => {
	let repository: ReturnType<typeof fakeRepository>;
	let service: AdminService;
	beforeEach(() => {
		repository = fakeRepository();
		repository.findUser.mockResolvedValue(user());
		service = new AdminService(repository as AdminRepositoryContract);
	});

	for (const role of ["BASIC", "EDITOR"] as const) {
		it.each(["listUsers", "getUser", "changeRole", "listAssignments", "assign", "revoke"] as const)(`${role} cannot invoke %s or reach persistence`, async method => {
			const denied = { ...actor, role };
			const operations = {
				listUsers: () => service.listUsers(denied), getUser: () => service.getUser(denied, userId),
				changeRole: () => service.changeRole(denied, userId, { role: "BASIC", expectedUpdatedAt: time }),
				listAssignments: () => service.listAssignments(denied, userId),
				assign: () => service.assign(denied, userId, workId, { expectedVersion: 0 }),
				revoke: () => service.revoke(denied, userId, workId, { expectedVersion: 1 })
			};
			await expect(operations[method]()).rejects.toMatchObject({ statusCode: 403 });
			for (const fn of Object.values(repository)) expect(fn).not.toHaveBeenCalled();
		});
	}

	it("projects the user allowlist even if persistence accidentally supplies private fields", async () => {
		repository.findUser.mockResolvedValue({ ...user(), email: "secret@example.test", passwordHash: "HASH", emailNormalized: "PRIVATE", deletedAt: null });
		await expect(service.getUser(actor, userId)).resolves.toEqual({ id: userId, username: "editor", role: "EDITOR", status: "ACTIVE", createdAt: time.toISOString(), updatedAt: time.toISOString() });
	});

	it("serializes list dates/cursor and retains suspended users without leaking secrets", async () => {
		repository.listUsers.mockResolvedValue({ items: [{ ...user({ status: "SUSPENDED" }), passwordHash: "HASH" }], hasMore: true, nextCursor: { createdAt: time, id: userId } });
		const result = await service.listUsers(actor, { status: "SUSPENDED", limit: 1 });
		expect(result).toEqual({ items: [{ id: userId, username: "editor", role: "EDITOR", status: "SUSPENDED", createdAt: time.toISOString(), updatedAt: time.toISOString() }], hasMore: true, nextCursor: { createdAt: time.toISOString(), id: userId } });
		expect(repository.listUsers).toHaveBeenCalledWith(actor, expect.objectContaining({ status: "SUSPENDED", limit: 1 }));
	});

	it("missing/deleted detail is 404 rather than an authentication-only ACTIVE lookup", async () => {
		repository.findUser.mockResolvedValue(null);
		await expect(service.getUser(actor, userId)).rejects.toMatchObject({ statusCode: 404 });
	});

	for (const status of ["ACTIVE", "SUSPENDED"] as const) {
		for (const role of ["BASIC", "EDITOR"] as const) {
			it(`changes a ${status} ${role} without changing account status`, async () => {
				repository.findUser.mockResolvedValue(user({ status, role }));
				repository.changeRole.mockResolvedValue(user({ status, role: role === "BASIC" ? "EDITOR" : "BASIC" }));
				const input = { role: role === "BASIC" ? "EDITOR" as const : "BASIC" as const, expectedUpdatedAt: time };
				const result = await service.changeRole(actor, userId, input);
				expect(result.status).toBe(status);
				expect(repository.changeRole).toHaveBeenCalledWith(actor, userId, input);
			});
		}
	}

	it.each([actor.id, userId])("protects own and other ADMIN targets (%s)", async target => {
		repository.findUser.mockResolvedValue(user({ id: target, role: "ADMIN" }));
		repository.changeRole.mockRejectedValue(new AppError("Protected administrator", 403));
		await expect(service.changeRole(actor, target, { role: "BASIC", expectedUpdatedAt: time })).rejects.toMatchObject({ statusCode: 403 });
	});

	it("does not shortcut a same-role request: persistence must atomically check CAS", async () => {
		repository.changeRole.mockResolvedValue(user());
		await service.changeRole(actor, userId, { role: "EDITOR", expectedUpdatedAt: time });
		expect(repository.changeRole).toHaveBeenCalledWith(actor, userId, { role: "EDITOR", expectedUpdatedAt: time });
	});

	it.each([403, 404, 409, 503])("preserves authoritative mutation rejection %s", async statusCode => {
		repository.changeRole.mockRejectedValue(new AppError("Safe administrative error", statusCode));
		await expect(service.changeRole(actor, userId, { role: "BASIC", expectedUpdatedAt: time })).rejects.toMatchObject({ statusCode });
	});

	it("returns the downgraded user; SQL owns atomic assignment revocations", async () => {
		repository.changeRole.mockResolvedValue(user({ role: "BASIC", updatedAt: new Date(+time + 1) }));
		const result = await service.changeRole(actor, userId, { role: "BASIC", expectedUpdatedAt: time });
		expect(result.role).toBe("BASIC");
		expect(result.updatedAt).toBe(new Date(+time + 1).toISOString());
		expect(repository.revoke).not.toHaveBeenCalled();
	});

	it("serializes assignments using their immutable createdAt cursor", async () => {
		const assignedAt = new Date(+time + 1000);
		repository.listAssignments.mockResolvedValue({ items: [{ ...assignment({ assignedAt, revokedAt: assignedAt, version: 3 }), secret: "PRIVATE" }], hasMore: false, nextCursor: null });
		await expect(service.listAssignments(actor, userId, { includeRevoked: true })).resolves.toEqual({ items: [{ ...assignment({ version: 3 }), createdAt: time.toISOString(), assignedAt: assignedAt.toISOString(), revokedAt: assignedAt.toISOString() }], hasMore: false, nextCursor: null });
	});

	it.each(["assign", "revoke"] as const)("%s delegates version checks even if state is already satisfied", async method => {
		repository[method].mockResolvedValue(assignment());
		const result = await service[method](actor, userId, workId, { expectedVersion: 1 });
		expect(repository[method]).toHaveBeenCalledWith(actor, userId, workId, { expectedVersion: 1 });
		expect(result.createdAt).toBe(time.toISOString());
		repository[method].mockRejectedValue(new AppError("Stale assignment", 409));
		await expect(service[method](actor, userId, workId, { expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
	});
});
