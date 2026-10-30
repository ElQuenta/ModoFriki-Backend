import express, { type ErrorRequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppError from "../../utils/AppError";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { startHttpServer } from "../../__tests__/helpers/http";
import { createCommunityRouter } from "../community.routes";

const actor = { id: "11111111-1111-4111-8111-111111111111", role: "BASIC", status: "ACTIVE", username: "reader" };
const targetId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const body = { targetType: "WORK", targetId, bodyMarkdown: "hello" };

describe("safe comment publication HTTP contracts", () => {
	let server: Awaited<ReturnType<typeof startHttpServer>>;
	let service: any;
	let authentication: any;
	beforeEach(async () => {
		service = {
			list: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
			create: vi.fn().mockResolvedValue({ id: operationId }), edit: vi.fn(), remove: vi.fn(), setVote: vi.fn(), removeVote: vi.fn(), report: vi.fn(), listReports: vi.fn(), resolveReport: vi.fn()
		};
		authentication = { authenticateToken: vi.fn().mockResolvedValue(actor) };
		const app = express(); app.use(express.json()); app.use("/api", createCommunityRouter(service, authentication));
		const errors: ErrorRequestHandler = (error, _req, res, _next) => ErrorResponseHandler(res, error); app.use(errors);
		server = await startHttpServer(app);
	});
	afterEach(async () => server?.close());
	const post = (key?: string) => server.request("/api/comments", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json", ...(key === undefined ? {} : { "idempotency-key": key }) }, body: JSON.stringify(body) });

	it("passes an optional UUID Idempotency-Key to creation and returns 201 only after service success", async () => {
		const response = await post(operationId);
		expect(response.status).toBe(201);
		expect(service.create).toHaveBeenCalledWith(body, { id: actor.id, role: actor.role }, operationId);
		await post();
		expect(service.create).toHaveBeenLastCalledWith(body, { id: actor.id, role: actor.role }, undefined);
	});

	it("rejects malformed or repeated idempotency headers before staging", async () => {
		expect((await post("not-a-uuid")).status).toBe(400);
		const repeated = await server.request("/api/comments", { method: "POST", headers: [["authorization", "Bearer token"], ["content-type", "application/json"], ["idempotency-key", operationId], ["idempotency-key", targetId]], body: JSON.stringify(body) });
		expect(repeated.status).toBe(400); expect(service.create).not.toHaveBeenCalled();
	});

	it.each([[403, "Comment creation restricted"], [409, "Idempotency key conflict"], [503, "Comment creation outcome unavailable"], [404, "Comment not found"]] as const)("preserves stable %i creation errors", async (status, message) => {
		service.create.mockRejectedValue(new AppError(message, status));
		const response = await post(operationId); expect(response.status).toBe(status);
		expect(await response.json()).toEqual({ success: false, code: status, error: { message } });
	});

	it("does not turn a creation 403 into an authentication failure", async () => {
		service.create.mockRejectedValue(new AppError("Comment creation restricted", 403));
		const response = await post(operationId); expect(response.status).toBe(403);
		expect(authentication.authenticateToken).toHaveBeenCalledOnce();
	});

	it("returns fail-closed 503 when decision filtering is unavailable", async () => {
		service.list.mockRejectedValue(new AppError("Comment visibility unavailable", 503));
		const response = await server.request(`/api/comments?targetType=WORK&targetId=${targetId}`);
		expect(response.status).toBe(503);
	});

	it("keeps an empty filtered page with hasMore and the examined-candidate cursor", async () => {
		service.list.mockResolvedValue({ items: [], hasMore: true, nextCursor: { createdAt: "2026-10-30T12:00:00.000Z", id: operationId } });
		const response = await server.request(`/api/comments?targetType=WORK&targetId=${targetId}`);
		expect(await response.json()).toMatchObject({ data: { items: [], hasMore: true, nextCursor: { id: operationId } } });
	});
});
