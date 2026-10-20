import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { authorize } from "../role.middleware";

const run = (locals: Record<string, unknown>) => {
	const req = {} as Request;
	const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), locals } as unknown as Response;
	const next = vi.fn() as unknown as NextFunction;
	let error: unknown;
	try {
		authorize(["ADMIN"])(req, res, next);
	} catch (caught) {
		error = caught;
	}
	return { next, error };
};

describe("authorize", () => {
	it("throws 401 without a user", () => {
		const { next, error } = run({});
		expect(error).toMatchObject({ statusCode: 401 });
		expect(next).not.toHaveBeenCalled();
	});

	it("throws 401 when a user exists but is not marked authenticated", () => {
		expect(run({ user: { id: "x", role: "ADMIN" } }).error).toMatchObject({ statusCode: 401 });
	});

	it("throws 403 with the wrong role", () => {
		const { next, error } = run({ authenticated: true, user: { id: "x", role: "BASIC" } });
		expect(error).toMatchObject({ statusCode: 403 });
		expect(next).not.toHaveBeenCalled();
	});

	it("calls next with the right role", () => {
		const { next, error } = run({ authenticated: true, user: { id: "x", role: "ADMIN" } });
		expect(error).toBeUndefined();
		expect(next).toHaveBeenCalledWith();
	});
});
