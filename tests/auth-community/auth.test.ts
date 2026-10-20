import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, hashSync } from "bcryptjs";
import { sign, verify, type JwtPayload } from "jsonwebtoken";
import config from "../../src/config/env";
import { AuthService } from "../../src/services/auth/auth.service";
import AppError from "../../src/utils/AppError";
import { user, ids } from "./fixtures";

const password = " Password123 ";
function fixture() {
	const state = { user: user({ passwordHash: hashSync(password, 4) }) as ReturnType<typeof user> | null };
	let created: unknown;
	const service = new AuthService({ findById: async () => state.user, findByEmail: async () => state.user,
		create: async (input) => { created = input; return user({ ...input }); } });
	return { state, service, created: () => created };
}
const status = (code: number) => (error: unknown) => error instanceof AppError && error.statusCode === code;

test("registration hashes untrimmed password, preserves display fields and issues seven-day HS256 JWT without private user fields", async () => {
	const f = fixture();
	const result = await f.service.register({ username: " Reader ", email: " Reader@example.com ", password, timezone: "America/La_Paz" });
	const input = f.created() as { passwordHash: string; username: string; email: string };
	assert.equal(input.username, "Reader"); assert.equal(input.email, "Reader@example.com");
	assert.notEqual(input.passwordHash, password); assert.equal(await compare(password, input.passwordHash), true);
	assert.deepEqual(Object.keys(result.user).sort(), ["createdAt", "email", "id", "role", "timezone", "username"]);
	assert.equal(result.user.role, "BASIC");
	const payload = verify(result.token, config.jwtSecret, { algorithms: ["HS256"] }) as JwtPayload;
	assert.equal(payload.exp! - payload.iat!, 604800); assert.equal(payload.id, ids.author);
});

for (const [label, body] of Object.entries({ role: { role: "ADMIN" }, hash: { passwordHash: "injected" },
	short: { password: "tiny" }, bytes: { password: "😀".repeat(19) }, username: { username: "ab" },
	email: { email: "invalid" }, timezone: { timezone: "invalid/zone" }, fixedOffset: { timezone: "+02:00" } })) {
	test(`registration rejects ${label} before persistence`, async () => {
		const f = fixture();
		await assert.rejects(f.service.register({ username: "reader", email: "r@example.com", password, ...body }), status(400));
		assert.equal(f.created(), undefined);
	});
}

test("login returns uniform unknown-email and wrong-password errors and rejects inactive/deleted users", async () => {
	const f = fixture();
	assert.equal((await f.service.login({ email: " Reader@Example.com ", password })).user.id, ids.author);
	let first: unknown;
	try { await f.service.login({ email: "r@example.com", password: "incorrect" }); } catch (error) { first = error; }
	f.state.user = null;
	await assert.rejects(f.service.login({ email: "r@example.com", password }), (error: unknown) => status(401)(error) && (error as Error).message === (first as Error).message);
	for (const changes of [{ status: "SUSPENDED" as const }, { deletedAt: new Date() }]) {
		f.state.user = user({ passwordHash: hashSync(password, 4), ...changes });
		await assert.rejects(f.service.login({ email: "r@example.com", password }), status(401));
	}
});

test("authentication reads current database role and rejects missing identity", async () => {
	const f = fixture();
	const token = sign({ id: ids.author, role: "ADMIN" }, config.jwtSecret, { expiresIn: "7d" });
	assert.equal((await f.service.authenticateToken(token)).role, "BASIC");
	f.state.user = null;
	await assert.rejects(f.service.authenticateToken(token), status(401));
	await assert.rejects(f.service.me("not-uuid"), status(401));
});

const now = Math.floor(Date.now() / 1000);
for (const [label, token] of Object.entries({ malformed: "broken", signature: sign({ id: ids.author, role: "BASIC" }, "wrong-secret", { expiresIn: "7d" }),
	algorithm: sign({ id: ids.author, role: "BASIC" }, config.jwtSecret, { algorithm: "HS384", expiresIn: "7d" }),
	expired: sign({ id: ids.author, role: "BASIC", iat: now - 10, exp: now - 1 }, config.jwtSecret),
	noExpiry: sign({ id: ids.author, role: "BASIC" }, config.jwtSecret),
	noIssuedAt: sign({ id: ids.author, role: "BASIC", exp: now + 20 }, config.jwtSecret, { noTimestamp: true }),
	tooLong: sign({ id: ids.author, role: "BASIC" }, config.jwtSecret, { expiresIn: "8d" }),
	future: sign({ id: ids.author, role: "BASIC", iat: now + 100, exp: now + 200 }, config.jwtSecret),
	badRole: sign({ id: ids.author, role: "ROOT" }, config.jwtSecret, { expiresIn: "7d" }) })) {
	test(`JWT rejects ${label}`, async () => { await assert.rejects(fixture().service.authenticateToken(token), status(401)); });
}

test("register propagates repository uniqueness conflict instead of issuing a token", async () => {
	const service = new AuthService({ findByEmail: async () => null, findById: async () => null,
		create: async () => { throw new AppError("Email or username already exists", 409); } });
	await assert.rejects(service.register({ email: "r@example.com", username: "reader", password }), status(409));
});
