import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import Joi from "joi";
import { validateBody } from "../validatebody.middleware";
import * as paramsModule from "../validateParams.middleware";
import { validateQuery } from "../validateQuery.middleware";

const schema = Joi.object({ page: Joi.number().integer().min(1).default(1), name: Joi.string().required() });

const setup = (req: Record<string, unknown>) => {
	const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), locals: {} } as unknown as Response;
	const next = vi.fn() as unknown as NextFunction;
	return { req: req as unknown as Request, res, next };
};

const expect400 = (res: Response, next: NextFunction) => {
	expect(next).not.toHaveBeenCalled();
	expect(res.status).toHaveBeenCalledWith(400);
	const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
	expect(body).toMatchObject({ success: false, code: 400 });
	expect(body.error.message).toMatch(/^Validation error: /);
	expect(body.error.message).toContain("\"name\" is required");
};

describe("validateBody", () => {
	it("responds 400 on invalid body", () => {
		const { req, res, next } = setup({ body: { page: "0" } });
		validateBody(schema)(req, res, next);
		expect400(res, next);
	});

	it("replaces body with converted values and calls next", () => {
		const { req, res, next } = setup({ body: { page: "3", name: "x" } });
		validateBody(schema)(req, res, next);
		expect(next).toHaveBeenCalledWith();
		expect(req.body).toEqual({ page: 3, name: "x" });
	});

	it("applies defaults", () => {
		const { req, res, next } = setup({ body: { name: "x" } });
		validateBody(schema)(req, res, next);
		expect(req.body).toEqual({ page: 1, name: "x" });
	});
});

describe("validateParams", () => {
	const validateParams = (paramsModule as Record<string, unknown>).validateParams as (s: Joi.ObjectSchema) => RequestHandler;

	it("is exported by validateParams.middleware", () => {
		expect(typeof validateParams).toBe("function");
	});

	it("responds 400 on invalid params", () => {
		const { req, res, next } = setup({ params: { page: "abc" }, query: {} });
		validateParams(schema)(req, res, next);
		expect400(res, next);
	});

	it("validates req.params and exposes converted values", () => {
		const { req, res, next } = setup({ params: { page: "2", name: "x" }, query: {} });
		validateParams(schema)(req, res, next);
		expect(next).toHaveBeenCalledWith();
		expect(req.params).toEqual({ page: 2, name: "x" });
	});
});

describe("validateQuery", () => {
	it("responds 400 on invalid query", () => {
		const { req, res, next } = setup({ query: { page: "0" }, params: {} });
		validateQuery(schema)(req, res, next);
		expect400(res, next);
	});

	it("exposes converted values as query and leaves params untouched", () => {
		const { req, res, next } = setup({ query: { page: "2", name: "x" }, params: { workId: "abc" } });
		validateQuery(schema)(req, res, next);
		expect(next).toHaveBeenCalledWith();
		expect(req.query).toEqual({ page: 2, name: "x" });
		expect(req.params).toEqual({ workId: "abc" });
	});
});
