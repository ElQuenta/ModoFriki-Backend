import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { AuthRepository } from "../../src/repositories/auth/auth.repository";
import { CatalogRepository } from "../../src/repositories/community/catalog.repository";
import { catchAndLogError } from "../../src/utils/logger";
import AppError from "../../src/utils/AppError";
import type { Logger } from "winston";
import { ids, user } from "./fixtures";

test("Auth repository separates display and normalized keys, fixes BASIC/ACTIVE and handles unique race", async () => {
	const calls: unknown[] = [];
	let duplicate = false;
	const fake = { user: { create: async (input: unknown) => { calls.push(input); if (duplicate) throw { code: "P2002", secret: "private" }; return user(); },
		findUnique: async (input: unknown) => { calls.push(input); return null; }, findMany: async (input: unknown) => { calls.push(input); return []; } } };
	const repo = new AuthRepository(fake as unknown as Pick<PrismaClient, "user">);
	await repo.create({ email: " Reader@Example.com ", username: " Reader ", passwordHash: "hashed" });
	assert.deepEqual(calls[0], { data: { email: "Reader@Example.com", emailNormalized: "reader@example.com", username: "Reader", usernameNormalized: "reader", passwordHash: "hashed", role: "BASIC", status: "ACTIVE" } });
	await repo.findByEmail(" Reader@Example.com ");
	assert.deepEqual(calls[1], { where: { emailNormalized: "reader@example.com", status: "ACTIVE", deletedAt: null } });
	await repo.findById(ids.author);
	assert.deepEqual(calls[2], { where: { id: ids.author, status: "ACTIVE", deletedAt: null } });
	await repo.findByIds([ids.author, ids.author]);
	assert.deepEqual(calls[3], { where: { id: { in: [ids.author] }, status: "ACTIVE", deletedAt: null }, select: { id: true, username: true, status: true, deletedAt: true } });
	await repo.findByIds([]); assert.equal(calls.length, 4);
	duplicate = true;
	await assert.rejects(repo.create({ email: "r@example.com", username: "reader", passwordHash: "hash" }), (error: unknown) => error instanceof AppError && error.statusCode === 409 && !error.message.includes("private"));
});

test("catalog queries restrict publication and deletion for work and chapter parent", async () => {
	const calls: unknown[] = [];
	const delegate = { findUnique: async (input: unknown) => { calls.push(input); return null; } };
	const repo = new CatalogRepository({ work: delegate, chapter: delegate } as unknown as Pick<PrismaClient, "work" | "chapter">);
	await repo.findWork(ids.work); await repo.findChapter(ids.third);
	assert.deepEqual(calls, [
		{ where: { id: ids.work, publicationStatus: "PUBLISHED", deletedAt: null }, select: { id: true } },
		{ where: { id: ids.third, status: "PUBLISHED", deletedAt: null, work: { publicationStatus: "PUBLISHED", deletedAt: null } }, select: { id: true, workId: true } }
	]);
});

test("logging never receives original error contents and preserves expected AppErrors", () => {
	const calls: unknown[][] = [];
	const logger = { log: (...args: unknown[]) => { calls.push(args); }, error: (...args: unknown[]) => { calls.push(args); } } as unknown as Logger;
	assert.throws(() => catchAndLogError(logger, new Error("password=secret JWT private"), "Static operation failed"), (error: unknown) => error instanceof AppError && error.statusCode === 500);
	const expected = new AppError("Invalid input", 400);
	assert.throws(() => catchAndLogError(logger, expected, "Static validation failed"), (error: unknown) => error === expected);
	assert.deepEqual(calls, [["Static operation failed"], ["warn", "Static validation failed", { statusCode: 400 }]]);
});
