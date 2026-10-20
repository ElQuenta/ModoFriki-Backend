import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/auth/auth.repository", () => ({ authRepository: {} }));
vi.mock("bcryptjs", () => ({
	hash: vi.fn(async () => "hashed-password"),
	hashSync: vi.fn(() => "dummy-hash"),
	compare: vi.fn(async () => true)
}));
vi.mock("jsonwebtoken", () => {
	class JsonWebTokenError extends Error {}
	class TokenExpiredError extends JsonWebTokenError {}
	return { JsonWebTokenError, TokenExpiredError, sign: vi.fn(() => "signed-token"), verify: vi.fn() };
});

import { compare, hash } from "bcryptjs";
import { sign, TokenExpiredError, JsonWebTokenError, verify } from "jsonwebtoken";
import { AuthService } from "../auth/auth.service";
import AppError from "../../utils/AppError";
import type { UserRecord } from "../../types/auth.types";

const userId = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const user = {
	id: userId, email: "ana@test.com", username: "ana", role: "BASIC", timezone: "UTC",
	status: "ACTIVE", deletedAt: null, passwordHash: "stored-hash", createdAt: new Date("2026-01-01T00:00:00.000Z")
} as unknown as UserRecord;

const makeRepo = () => ({ findByEmail: vi.fn(), findById: vi.fn(), create: vi.fn() });
const expectStatus = async (promise: Promise<unknown>, status: number) => {
	const error = await promise.catch((e: unknown) => e);
	expect(error).toBeInstanceOf(AppError);
	expect((error as AppError).statusCode).toBe(status);
};
const now = () => Math.floor(Date.now() / 1000);

let repo: ReturnType<typeof makeRepo>;
let service: AuthService;

beforeEach(() => {
	vi.clearAllMocks();
	repo = makeRepo();
	service = new AuthService(repo);
});

describe("AuthService.register", () => {
	it("hashes the password, creates the user and returns dto + token without passwordHash", async () => {
		repo.create.mockResolvedValue(user);
		const result = await service.register({ username: " ana ", email: " ana@test.com ", password: "password123" });
		expect(hash).toHaveBeenCalledWith("password123", 4);
		expect(repo.create).toHaveBeenCalledWith({ username: "ana", email: "ana@test.com", passwordHash: "hashed-password", timezone: undefined });
		expect(sign).toHaveBeenCalledWith({ id: userId, role: "BASIC" }, expect.any(String), expect.objectContaining({ algorithm: "HS256" }));
		expect(result).toEqual({ token: "signed-token", user: { id: userId, email: "ana@test.com", username: "ana", role: "BASIC", timezone: "UTC", createdAt: "2026-01-01T00:00:00.000Z" } });
		expect(result.user).not.toHaveProperty("passwordHash");
	});

	it("propagates 409 when email or username already exists", async () => {
		repo.create.mockRejectedValue(new AppError("Email or username already exists", 409));
		await expectStatus(service.register({ username: "ana", email: "ana@test.com", password: "password123" }), 409);
	});

	it.each([
		["missing body", undefined],
		["invalid email", { username: "ana", email: "nope", password: "password123" }],
		["short password", { username: "ana", email: "ana@test.com", password: "short" }],
		["short username", { username: "an", email: "ana@test.com", password: "password123" }],
		["unknown field (role escalation)", { username: "ana", email: "ana@test.com", password: "password123", role: "ADMIN" }],
		["invalid timezone", { username: "ana", email: "ana@test.com", password: "password123", timezone: "Mars/Olympus" }]
	])("rejects %s with 400 before touching the repository", async (_name, input) => {
		await expectStatus(service.register(input), 400);
		expect(repo.create).not.toHaveBeenCalled();
	});

	it("wraps unexpected repository errors as 500", async () => {
		repo.create.mockRejectedValue(new Error("db down"));
		await expectStatus(service.register({ username: "ana", email: "ana@test.com", password: "password123" }), 500);
	});
});

describe("AuthService.login", () => {
	const credentials = { email: "Ana@Test.com", password: "password123" };

	it("returns token for valid credentials and looks up the lowercased email", async () => {
		repo.findByEmail.mockResolvedValue(user);
		const result = await service.login(credentials);
		expect(repo.findByEmail).toHaveBeenCalledWith("ana@test.com");
		expect(compare).toHaveBeenCalledWith("password123", "stored-hash");
		expect(result.token).toBe("signed-token");
	});

	it("returns 401 on wrong password", async () => {
		repo.findByEmail.mockResolvedValue(user);
		vi.mocked(compare).mockResolvedValueOnce(false as never);
		await expectStatus(service.login(credentials), 401);
	});

	it("returns 401 on unknown email and still runs a dummy compare", async () => {
		repo.findByEmail.mockResolvedValue(null);
		await expectStatus(service.login(credentials), 401);
		expect(compare).toHaveBeenCalledWith("password123", "dummy-hash");
	});

	it.each([
		["inactive", { status: "SUSPENDED" }],
		["deleted", { deletedAt: new Date() }]
	])("returns 401 for %s user even with correct password", async (_name, patch) => {
		repo.findByEmail.mockResolvedValue({ ...user, ...patch });
		await expectStatus(service.login(credentials), 401);
	});

	it("returns 400 on malformed input", async () => {
		await expectStatus(service.login({ email: "ana@test.com" }), 400);
		expect(repo.findByEmail).not.toHaveBeenCalled();
	});
});

describe("AuthService.me", () => {
	it("returns the dto of an active user", async () => {
		repo.findById.mockResolvedValue(user);
		await expect(service.me(userId)).resolves.toMatchObject({ id: userId, email: "ana@test.com" });
	});

	it("returns 401 for a missing user (code treats it as auth failure, not 404)", async () => {
		repo.findById.mockResolvedValue(null);
		await expectStatus(service.me(userId), 401);
	});

	it("returns 401 for an inactive user", async () => {
		repo.findById.mockResolvedValue({ ...user, status: "SUSPENDED" });
		await expectStatus(service.me(userId), 401);
	});

	it("returns 401 for a non-uuid id without querying", async () => {
		await expectStatus(service.me("not-a-uuid"), 401);
		expect(repo.findById).not.toHaveBeenCalled();
	});
});

describe("AuthService.authenticateToken", () => {
	const validPayload = () => ({ id: userId, role: "BASIC", iat: now() - 10, exp: now() + 3600 });

	it("returns the user for a valid token", async () => {
		vi.mocked(verify).mockReturnValue(validPayload() as never);
		repo.findById.mockResolvedValue(user);
		await expect(service.authenticateToken("tok")).resolves.toMatchObject({ id: userId });
		expect(verify).toHaveBeenCalledWith("tok", expect.any(String), expect.objectContaining({ algorithms: ["HS256"] }));
	});

	it("returns 401 for an invalid signature", async () => {
		vi.mocked(verify).mockImplementation(() => { throw new JsonWebTokenError("invalid signature"); });
		await expectStatus(service.authenticateToken("tok"), 401);
	});

	it("returns 401 for an expired token", async () => {
		vi.mocked(verify).mockImplementation(() => { throw new TokenExpiredError("jwt expired", new Date()); });
		await expectStatus(service.authenticateToken("tok"), 401);
	});

	it.each([
		["string payload", "plain"],
		["unknown role", { ...validPayload(), role: "ROOT" }],
		["non-uuid id", { ...validPayload(), id: "x" }],
		["lifetime above 7 days", { ...validPayload(), exp: now() + 8 * 24 * 3600 }],
		["iat in the future", { ...validPayload(), iat: now() + 1000, exp: now() + 2000 }]
	])("returns 401 for %s", async (_name, payload) => {
		vi.mocked(verify).mockReturnValue(payload as never);
		await expectStatus(service.authenticateToken("tok"), 401);
		expect(repo.findById).not.toHaveBeenCalled();
	});

	it("returns 401 when the token user no longer exists", async () => {
		vi.mocked(verify).mockReturnValue(validPayload() as never);
		repo.findById.mockResolvedValue(null);
		await expectStatus(service.authenticateToken("tok"), 401);
	});
});
