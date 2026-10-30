import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { prisma } from "./fixtures";

// Applies every migration to a brand-new database on the same disposable server, then drops it.
const name = `modofriki_migrations_${randomUUID().slice(0, 8)}`;
const freshUrl = (() => { const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`; return url.toString(); })();
const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
let fresh: PrismaClient | undefined;

afterAll(async () => {
	await fresh?.$disconnect();
	await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	await prisma.$disconnect();
});

describe("migraciones", () => {
	it("se aplican todas desde cero sin errores", async () => {
		await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
		execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: freshUrl }, stdio: "pipe" });
		fresh = new PrismaClient({ adapter: new PrismaPg({ connectionString: freshUrl }) });
		const [{ applied }] = await fresh.$queryRaw<{ applied: number }[]>`SELECT COUNT(*)::int AS applied FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`;
		expect(applied).toBe(migrations);
		expect(await fresh.user.count()).toBe(0);
	});
});
