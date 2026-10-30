import express, { type ErrorRequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { startHttpServer } from "../../__tests__/helpers/http";

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN", status: "ACTIVE", username: "admin" };
const userId = "22222222-2222-4222-8222-222222222222";
const sanctionId = "33333333-3333-4333-8333-333333333333";
const prefix = `/api/admin/users/${userId}/comment-sanctions`;

describe("comment sanction HTTP contracts", () => {
	let server: Awaited<ReturnType<typeof startHttpServer>>;
	let service: any;
	let authentication: any;
	beforeEach(async () => {
		const modulePath = "../comment-sanctions.routes.js";
		const { createCommentSanctionsRouter } = await import(modulePath);
		service = {
			list: vi.fn().mockResolvedValue({ current: null, history: { items: [], hasMore: false, nextCursor: null } }),
			impose: vi.fn().mockResolvedValue({ id: sanctionId, userId }),
			revoke: vi.fn().mockResolvedValue({ id: sanctionId, userId })
		};
		authentication = { authenticateToken: vi.fn().mockResolvedValue(admin) };
		const app = express(); app.use(express.json());
		app.use("/api", createCommentSanctionsRouter(service, authentication));
		const errors: ErrorRequestHandler = (error, _req, res, _next) => ErrorResponseHandler(res, error);
		app.use(errors); server = await startHttpServer(app);
	});
	afterEach(async () => server?.close());
	const request = (method: string, path: string, body?: unknown, token = true) => server.request(path, { method, headers: { ...(token ? { authorization: "Bearer test-token" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

	it.each([["GET", prefix], ["POST", prefix], ["PUT", `${prefix}/${sanctionId}/revocation`]])("requires authentication for %s %s", async (method, path) => {
		const response = await request(method, path, method === "POST" ? { reason: "spam", endsAt: null } : method === "PUT" ? {} : undefined, false);
		expect(response.status).toBe(401); expect(service.list).not.toHaveBeenCalled(); expect(service.impose).not.toHaveBeenCalled(); expect(service.revoke).not.toHaveBeenCalled();
	});

	it.each(["BASIC", "EDITOR"])("forbids %s before service access", async role => {
		authentication.authenticateToken.mockResolvedValue({ ...admin, role });
		const response = await request("POST", prefix, { reason: "spam", endsAt: null });
		expect(response.status).toBe(403); expect(service.impose).not.toHaveBeenCalled();
	});

	it("uses existing envelopes and exact status codes", async () => {
		const created = await request("POST", prefix, { reason: " spam ", endsAt: null });
		expect(created.status).toBe(201); expect(await created.json()).toMatchObject({ success: true, code: 201, data: { id: sanctionId } });
		const revoked = await request("PUT", `${prefix}/${sanctionId}/revocation`, {});
		expect(revoked.status).toBe(200); expect(await revoked.json()).toMatchObject({ success: true, code: 200, data: { id: sanctionId } });
	});

	it("rejects unknown/server fields and malformed UUID before service access", async () => {
		for (const [path, body] of [[prefix, { reason: "spam", endsAt: null, imposedById: admin.id }], [`/api/admin/users/not-a-uuid/comment-sanctions`, { reason: "spam", endsAt: null }]] as const) {
			const response = await request("POST", path, body); expect(response.status).toBe(400);
		}
		expect(service.impose).not.toHaveBeenCalled();
	});
});
