import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import Joi from "joi";
import express from "express";
import { startHttpServer } from "../../__tests__/helpers/http";
import { validateAdminInput } from "../admin-validation.middleware";

const schema = Joi.object({ limit: Joi.number().integer().min(1).max(100).default(20), evidence: Joi.object({ id: Joi.string().required() }) });
function setup(source: "body" | "params" | "query", value: unknown) {
	const req = {} as Request;
	Object.defineProperty(req, source, { configurable: true, get: () => value });
	const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
	const next = vi.fn() as unknown as NextFunction;
	return { req, res, next };
}

describe("strict administrative validation", () => {
	it("validates params/query/body on an actual Express 5 HTTP request", async () => {
		const app = express();
		app.use(express.json());
		app.post("/users/:userId",
			validateAdminInput("params", Joi.object({ userId: Joi.string().uuid().required() })),
			validateAdminInput("query", schema),
			validateAdminInput("body", Joi.object({ expectedVersion: Joi.number().integer().min(0).required() })),
			(req, res) => { res.json({ query: req.query, body: req.body, params: req.params }); });
		const server = await startHttpServer(app);
		try {
			const url = "/users/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
			const send = (path: string, body: object) => server.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
			const response = await send(url + "?limit=5", { expectedVersion: "0" });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ query: { limit: 5 }, body: { expectedVersion: 0 }, params: { userId: url.split("/")[2] } });
			expect((await send(url + "?includeSecrets=true", { expectedVersion: 0 })).status).toBe(400);
			expect((await send(url, { expectedVersion: 0, role: "ADMIN" })).status).toBe(400);
			expect((await send("/users/invalid", { expectedVersion: 0 })).status).toBe(400);
		} finally { await server.close(); }
	});
	it.each(["body", "params", "query"] as const)("rejects unknown privileged keys in %s without stripping them", source => {
		const { req, res, next } = setup(source, { limit: "10", role: "ADMIN" });
		validateAdminInput(source, schema)(req, res, next);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ success: false, code: 400, error: { message: expect.stringMatching(/^Validation error:/) } });
		expect(next).not.toHaveBeenCalled();
		expect(req[source]).toEqual({ limit: "10", role: "ADMIN" });
	});

	it.each(["body", "params", "query"] as const)("converts and exposes validated %s even with Express getter properties", source => {
		const { req, res, next } = setup(source, { limit: "10" });
		validateAdminInput(source, schema)(req, res, next);
		expect(req[source]).toEqual({ limit: 10 });
		expect(next).toHaveBeenCalledWith();
		expect(res.status).not.toHaveBeenCalled();
	});

	it("rejects nested unknowns and arrays in place of an object", () => {
		for (const value of [{ evidence: { id: "x", authorId: "forged" } }, [{ limit: 2 }], null]) {
			const { req, res, next } = setup("body", value);
			validateAdminInput("body", schema)(req, res, next);
			expect(res.status).toHaveBeenCalledWith(400);
			expect(next).not.toHaveBeenCalled();
		}
	});

	it("applies defaults and rejects invalid limits without including supplied values in errors", () => {
		const defaults = setup("query", {});
		validateAdminInput("query", schema)(defaults.req, defaults.res, defaults.next);
		expect(defaults.req.query).toEqual({ limit: 20 });
		for (const value of [0, 101, "private-invalid-value"]) {
			const ctx = setup("query", { limit: value });
			validateAdminInput("query", schema)(ctx.req, ctx.res, ctx.next);
			expect(ctx.res.status).toHaveBeenCalledWith(400);
			expect(JSON.stringify(vi.mocked(ctx.res.json).mock.calls)).not.toContain("private-invalid-value");
		}
	});

	it("handles a bodyless revocation while still enforcing required fields on other requests", () => {
		const empty = setup("body", undefined);
		validateAdminInput("body", Joi.object({}))(empty.req, empty.res, empty.next);
		expect(empty.req.body).toEqual({});
		expect(empty.next).toHaveBeenCalledWith();
		const required = setup("body", undefined);
		validateAdminInput("body", Joi.object({ role: Joi.string().required() }))(required.req, required.res, required.next);
		expect(required.res.status).toHaveBeenCalledWith(400);
	});
});
