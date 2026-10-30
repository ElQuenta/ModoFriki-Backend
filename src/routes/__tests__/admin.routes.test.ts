import express, { type ErrorRequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/auth/admin.service", () => ({ adminService: {} }));
vi.mock("../../services/auth/auth.service", () => ({ authService: { authenticateToken: vi.fn() } }));

import { createAdminRouter } from "../admin.routes";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { startHttpServer } from "../../__tests__/helpers/http";
import AppError from "../../utils/AppError";

const userId = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";
const actor = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN", status: "ACTIVE", username: "admin" };
const instant = "2026-10-30T12:00:00.000Z";
const userDto = { id: userId, username: "editor", role: "EDITOR", status: "ACTIVE", createdAt: instant, updatedAt: instant };
const prefix = `/api/admin/users/${userId}`;
const endpoints = [
	["GET", "/api/admin/users", undefined], ["GET", prefix, undefined],
	["PATCH", `${prefix}/role`, { role: "BASIC", expectedUpdatedAt: instant }],
	["GET", `${prefix}/work-assignments`, undefined],
	["PUT", `${prefix}/work-assignments/${workId}`, { expectedVersion: 0 }],
	["PATCH", `${prefix}/work-assignments/${workId}/revocation`, { expectedVersion: 1 }]
] as const;

describe("administrative HTTP contracts US1", () => {
	let server: Awaited<ReturnType<typeof startHttpServer>>;
	let service: { listUsers: ReturnType<typeof vi.fn>; getUser: ReturnType<typeof vi.fn>; changeRole: ReturnType<typeof vi.fn>; listAssignments: ReturnType<typeof vi.fn>; assign: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> };
	let authenticateToken: ReturnType<typeof vi.fn>;
	beforeEach(async () => {
		service = { listUsers: vi.fn().mockResolvedValue({ items: [userDto], hasMore: false, nextCursor: null }), getUser: vi.fn().mockResolvedValue(userDto), changeRole: vi.fn().mockResolvedValue(userDto), listAssignments: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }), assign: vi.fn().mockResolvedValue({ version: 1 }), revoke: vi.fn().mockResolvedValue({ version: 2 }) };
		authenticateToken = vi.fn().mockResolvedValue(actor);
		const app = express();
		app.use(express.json());
		app.use("/api", createAdminRouter(service as never, { authenticateToken } as never));
		const handler: ErrorRequestHandler = (error, _req, res, _next) => ErrorResponseHandler(res, error);
		app.use(handler);
		server = await startHttpServer(app);
	});
	afterEach(async () => { await server?.close(); });
	const init = (method: string, body?: unknown, token = true): RequestInit => ({ method, headers: { ...(token ? { authorization: "Bearer signed-test-token" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

	it.each(endpoints)("%s %s requires authentication before service access", async (method, path, body) => {
		const response = await server.request(path, init(method, body, false));
		expect(response.status).toBe(401);
		for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
		expect(authenticateToken).not.toHaveBeenCalled();
	});

	for (const role of ["BASIC", "EDITOR"] as const) {
		it.each(endpoints)(`${role} cannot invoke %s %s`, async (method, path, body) => {
			authenticateToken.mockResolvedValue({ ...actor, role });
			const response = await server.request(path, init(method, body));
			expect(response.status).toBe(403);
			for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
		});
	}

	it("returns the existing success envelope and supplies actor from authentication", async () => {
		const response = await server.request(prefix, init("GET"));
		expect(await response.json()).toEqual({ success: true, code: 200, data: userDto });
		expect(service.getUser).toHaveBeenCalledWith(expect.objectContaining({ id: actor.id, role: "ADMIN" }), userId);
	});

	it("extracts typed filters and the complete date/id cursor", async () => {
		const response = await server.request(`/api/admin/users?limit=1&role=EDITOR&status=SUSPENDED&cursorCreatedAt=${instant}&cursorId=${userId}`, init("GET"));
		expect(response.status).toBe(200);
		expect(service.listUsers).toHaveBeenCalledWith(expect.objectContaining({ id: actor.id }), expect.objectContaining({ limit: 1, role: "EDITOR", status: "SUSPENDED", cursor: { createdAt: new Date(instant), id: userId } }));
	});

	it("parses includeRevoked=false as boolean false and applies pagination defaults", async () => {
		const response = await server.request(`${prefix}/work-assignments?includeRevoked=false`, init("GET"));
		expect(response.status).toBe(200);
		expect(service.listAssignments).toHaveBeenCalledWith(expect.objectContaining({ id: actor.id }), userId, expect.objectContaining({ limit: 20, includeRevoked: false }));
	});

	it("passes role CAS as Date with exactly authenticated actor and allowlisted body", async () => {
		const response = await server.request(`${prefix}/role`, init("PATCH", { role: "BASIC", expectedUpdatedAt: instant }));
		expect(response.status).toBe(200);
		expect(service.changeRole).toHaveBeenCalledWith(expect.objectContaining({ id: actor.id }), userId, { role: "BASIC", expectedUpdatedAt: new Date(instant) });
	});

	it.each([
		["GET", "/api/admin/users?limit=101", undefined], ["GET", "/api/admin/users?limit=0", undefined],
		["GET", "/api/admin/users?cursorId=" + userId, undefined], ["GET", "/api/admin/users?cursorCreatedAt=" + instant, undefined],
		["GET", "/api/admin/users?cursorCreatedAt=invalid&cursorId=" + userId, undefined],
		["GET", "/api/admin/users?status=DELETED", undefined], ["GET", "/api/admin/users?passwordHash=true", undefined],
		["GET", "/api/admin/users?limit=1&limit=2", undefined], ["GET", "/api/admin/users/not-a-uuid", undefined],
		["PATCH", `${prefix}/role`, { role: "ADMIN", expectedUpdatedAt: instant }],
		["PATCH", `${prefix}/role`, { role: "BASIC", expectedUpdatedAt: "2026-10-30T12:00:00Z" }],
		["PATCH", `${prefix}/role`, { role: "BASIC", expectedUpdatedAt: instant, status: "ACTIVE" }],
		["PATCH", `${prefix}/role`, { role: "BASIC", expectedUpdatedAt: instant, actorId: userId }],
		["PATCH", `${prefix}/role`, { role: "BASIC" }],
		["GET", `${prefix}/work-assignments?includeRevoked=anything`, undefined],
		["PUT", `${prefix}/work-assignments/${workId}`, { expectedVersion: -1 }],
		["PUT", `${prefix}/work-assignments/${workId}`, { expectedVersion: 1.5 }],
		["PUT", `${prefix}/work-assignments/${workId}`, { expectedVersion: 0, assignedById: userId }],
		["PATCH", `${prefix}/work-assignments/${workId}/revocation`, { expectedVersion: 0 }],
		["PATCH", `${prefix}/work-assignments/${workId}/revocation`, undefined]
	])("rejects invalid or unknown input: %s %s", async (method, path, body) => {
		const response = await server.request(path, init(method, body));
		expect(response.status).toBe(400);
		for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
	});

	it.each([401, 403, 404, 409, 503])("preserves operational error %s in the standard envelope", async status => {
		service.getUser.mockRejectedValue(new AppError("Safe failure", status));
		const response = await server.request(prefix, init("GET"));
		expect(response.status).toBe(status);
		expect(await response.json()).toEqual({ success: false, code: status, error: { message: "Safe failure" } });
	});

	it("unexpected provider errors return a generic 500 without credential/stack disclosure", async () => {
		service.getUser.mockRejectedValue(new Error("postgres://secret:credential@provider/private"));
		const response = await server.request(prefix, init("GET"));
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, code: 500, error: { message: "Internal Server Error" } });
	});
});
