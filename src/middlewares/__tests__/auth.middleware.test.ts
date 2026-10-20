import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("../../services/auth/auth.service", () => ({ authService: { authenticateToken: vi.fn() } }));

import { createAuthenticate, createOptionalAuthenticate } from "../auth.middleware";
import AppError from "../../utils/AppError";

const user = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN", username: "alan" };

const setup = (authorization?: string) => {
	const req = { headers: authorization === undefined ? {} : { authorization } } as unknown as Request;
	const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), locals: {} } as unknown as Response;
	const next = vi.fn() as unknown as NextFunction;
	return { req, res, next };
};

const service = (impl: (token: string) => Promise<unknown>) => {
	const authenticateToken = vi.fn(impl);
	return { svc: { authenticateToken } as never, authenticateToken };
};

describe("createAuthenticate", () => {
	it("rejects with 401 when there is no token", async () => {
		const { svc, authenticateToken } = service(async () => user);
		const { req, res, next } = setup();
		await expect(createAuthenticate(svc)(req, res, next)).rejects.toMatchObject({ statusCode: 401 });
		expect(next).not.toHaveBeenCalled();
		expect(authenticateToken).not.toHaveBeenCalled();
	});

	it("rejects with 401 on a non-Bearer Authorization header", async () => {
		const { req, res, next } = setup("Basic abc");
		await expect(createAuthenticate(service(async () => user).svc)(req, res, next)).rejects.toMatchObject({ statusCode: 401 });
		expect(next).not.toHaveBeenCalled();
	});

	it("rejects with 401 when the service rejects the token", async () => {
		const { svc } = service(async () => { throw new AppError("Invalid token", 401); });
		const { req, res, next } = setup("Bearer bad.token");
		await expect(createAuthenticate(svc)(req, res, next)).rejects.toMatchObject({ statusCode: 401 });
		expect(next).not.toHaveBeenCalled();
		expect(res.locals.user).toBeUndefined();
	});

	it("sets res.locals.user and req.user and calls next with a valid token", async () => {
		const { svc, authenticateToken } = service(async () => user);
		const { req, res, next } = setup("Bearer good.token");
		await createAuthenticate(svc)(req, res, next);
		expect(authenticateToken).toHaveBeenCalledWith("good.token");
		expect(res.locals.user).toEqual(user);
		expect(res.locals.authenticated).toBe(true);
		expect(req.user).toEqual({ id: user.id, role: "ADMIN" });
		expect(next).toHaveBeenCalledWith();
	});
});

describe("createOptionalAuthenticate", () => {
	it("calls next as anonymous without Authorization header", async () => {
		const { svc, authenticateToken } = service(async () => user);
		const { req, res, next } = setup();
		await createOptionalAuthenticate(svc)(req, res, next);
		expect(next).toHaveBeenCalledWith();
		expect(authenticateToken).not.toHaveBeenCalled();
		expect(res.locals.user).toBeUndefined();
		expect(req.user).toBeUndefined();
	});

	it("still rejects with 401 when a header is present but invalid", async () => {
		const { req, res, next } = setup("Bearer");
		await expect(createOptionalAuthenticate(service(async () => user).svc)(req, res, next)).rejects.toMatchObject({ statusCode: 401 });
		expect(next).not.toHaveBeenCalled();
	});

	it("authenticates when a valid token is present", async () => {
		const { req, res, next } = setup("Bearer good.token");
		await createOptionalAuthenticate(service(async () => user).svc)(req, res, next);
		expect(res.locals.user).toEqual(user);
		expect(next).toHaveBeenCalledWith();
	});
});
