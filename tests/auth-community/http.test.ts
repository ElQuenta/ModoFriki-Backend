import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { hashSync } from "bcryptjs";
import { sign } from "jsonwebtoken";
import app from "../../src/app";
import config from "../../src/config/env";
import { AuthService } from "../../src/services/auth/auth.service";
import { createAuthRouter } from "../../src/routes/auth.routes";
import { createCommunityRouter } from "../../src/routes/community.routes";
import { authorize } from "../../src/middlewares/role.middleware";
import { ErrorResponseHandler } from "../../src/handlers/error.handler";
import { actor, admin, communityFixture, ids, user } from "./fixtures";

async function serving(application: Express, operation: (base: string) => Promise<void>) {
	const server = application.listen(0, "127.0.0.1"); await once(server, "listening");
	try { await operation(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
	finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => ErrorResponseHandler(res, error);

test("HTTP real routers exercise extraction, auth, role freshness, envelopes and every community action", async () => {
	const f = communityFixture();
	const state = { user: user({ passwordHash: hashSync("Password123", 4) }) as ReturnType<typeof user> | null };
	const auth = new AuthService({ findByEmail: async () => state.user, findById: async () => state.user,
		create: async (input) => user(input) });
	const api = express(); api.use(express.json());
	api.use("/api/auth", createAuthRouter(auth)); api.use("/api", createCommunityRouter(f.service, auth));
	api.get("/guard", (_req, res, next) => { res.req.user = admin; next(); }, authorize(["ADMIN"]), (_req, res) => res.send("unexpected"));
	api.use(errorHandler);
	await serving(api, async (base) => {
		let token = sign({ id: actor.id, role: "ADMIN" }, config.jwtSecret, { expiresIn: "7d" });
		const request = (path: string, method = "GET", body?: unknown, authHeader: string | null = `Bearer ${token}`) => fetch(base + path, {
			method, headers: { ...(authHeader === null ? {} : { Authorization: authHeader }), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		});
		let response = await request("/api/auth/register", "POST", { username: "reader", email: "r@example.com", password: "Password123" }, null);
		assert.equal(response.status, 201); assert.equal((await response.json()).data.user.role, "BASIC");
		response = await request("/api/auth/login", "POST", { email: "r@example.com", password: "Password123" }, null);
		assert.equal(response.status, 200); assert.ok((await response.json()).data.token);
		response = await request("/api/auth/me"); assert.equal(response.status, 200);
		assert.equal((await response.json()).data.role, "BASIC");
		assert.equal((await request("/api/auth/me", "GET", undefined, null)).status, 401);
		assert.equal((await request("/api/auth/me", "GET", undefined, "Basic bad")).status, 401);
		const selector = `targetType=WORK&targetId=${ids.work}`;
		response = await request(`/api/comments?${selector}`, "GET", undefined, null);
		assert.equal(response.status, 200); assert.equal((await response.json()).data.items[0].id, ids.root);
		assert.equal((await request(`/api/comments?${selector}`, "GET", undefined, "Bearer broken")).status, 401);
		assert.equal((await request("/api/comments", "POST", {}, null)).status, 401);
		response = await request("/api/comments", "POST", { targetType: "WORK", targetId: ids.work, bodyMarkdown: "root" });
		assert.equal(response.status, 201); assert.equal((await response.json()).success, true);
		assert.equal((await request(`/api/comments/${ids.root}`, "PATCH", { bodyMarkdown: "edited", expectedRevision: 2 })).status, 200);
		assert.equal((await request(`/api/comments/${ids.root}/vote`, "PUT", { value: 1 })).status, 200);
		assert.equal((await request(`/api/comments/${ids.root}/vote`, "DELETE")).status, 204);
		response = await request(`/api/comments/${ids.root}/reports`, "POST", { reason: "SPAM", details: "review" });
		assert.equal(response.status, 201); assert.equal("reporterId" in (await response.json()).data, false);
		assert.equal((await request("/api/comment-reports")).status, 403);
		assert.equal((await request("/guard", "GET", undefined, null)).status, 401);
		state.user = user({ id: admin.id, role: "ADMIN" });
		token = sign({ id: admin.id, role: "BASIC" }, config.jwtSecret, { expiresIn: "7d" });
		response = await request("/api/comment-reports?status=OPEN"); assert.equal(response.status, 200);
		assert.equal((await response.json()).data.items[0].reporterId, actor.id);
		assert.equal((await request(`/api/comment-reports/${ids.report}`, "PATCH", { status: "DISMISSED", resolution: "reviewed" })).status, 200);
		response = await request(`/api/comments/${ids.root}`, "DELETE"); assert.equal(response.status, 204); assert.equal(await response.text(), "");
		assert.deepEqual(f.calls.find((c) => c.method === "softDeleteAsModerator")?.input, { commentId: ids.root, moderatorId: admin.id });
		state.user = null; assert.equal((await request("/api/auth/me")).status, 401);
	});
});

test("actual app retains health, docs, CORS, JSON 404 and malformed/oversize body responses without database connection", async () => {
	await serving(app, async (base) => {
		let response = await fetch(base + "/health", { headers: { Origin: "http://localhost:5173" } });
		assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true, code: 200, data: { status: "ok" } });
		assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
		response = await fetch(base + "/missing"); assert.equal(response.status, 404); assert.equal((await response.json()).error.message, "Route not found");
		response = await fetch(base + "/api/docs/"); assert.equal(response.status, 200); assert.match(await response.text(), /swagger-ui/);
		response = await fetch(base + "/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" });
		assert.equal(response.status, 400); assert.equal((await response.json()).error.message, "Malformed JSON body");
		response = await fetch(base + "/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(110000) }) });
		assert.equal(response.status, 413); assert.equal((await response.json()).error.message, "Payload too large");
	});
});
