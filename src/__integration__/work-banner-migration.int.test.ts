import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./fixtures";

const name = `modofriki_banner_cutover_${randomUUID().slice(0, 8)}`;
const freshUrl = (() => { const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`; return url.toString(); })();
const priorMigrations = ["20261019000100_core_domain", "20261019000200_chapter_read_receipts", "20261020000100_work_visits_count", "20261029000100_admin_assignments", "20261029000200_comment_sanctions_decisions"];

afterAll(async () => {
	await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	await prisma.$disconnect();
});

describe("cutover de banner de obra", () => {
	it("captures only accredited historical publications and preserves previous reader columns", { timeout: 90_000 }, async () => {
		await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
		const client = new Client({ connectionString: freshUrl }); await client.connect();
		try {
			for (const migration of priorMigrations) await client.query(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
			const [userId, typeId, coverId, publishedId, oldDraftId, neverPublishedId] = Array.from({ length: 6 }, () => randomUUID());
			await client.query(`INSERT INTO "User" ("id", "email", "emailNormalized", "username", "usernameNormalized", "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$2,$3,$3,'test-only',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [userId, `${userId}@migration.test`, `migration_${userId.slice(0, 8)}`]);
			await client.query(`INSERT INTO "WorkType" ("id", "name", "slug") VALUES ($1,$2,$3)`, [typeId, "Migration fixture", `migration-${typeId.slice(0, 8)}`]);
			await client.query(`INSERT INTO "MediaAsset" ("id", "pathname", "url", "contentType", "sizeBytes", "createdById") VALUES ($1,$2,$3,'image/png',1,$4)`, [coverId, `migration/${coverId}.png`, `https://fixtures.invalid/${coverId}.png`, userId]);
			for (const [id, publishedAt] of [[publishedId, new Date()], [oldDraftId, new Date()], [neverPublishedId, null]] as const) {
				await client.query(`INSERT INTO "Work" ("id", "title", "slug", "synopsis", "typeId", "publicationStatus", "coverAssetId", "createdById", "updatedById", "publishedAt", "createdAt", "updatedAt") VALUES ($1,$2,$3,'fixture',$4,$5,$6,$7,$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [id, id, `work-${id.slice(0, 8)}`, typeId, id === publishedId ? "PUBLISHED" : "DRAFT", coverId, userId, publishedAt]);
			}
			await client.query(readFileSync("prisma/migrations/20261029000300_work_detail_banner/migration.sql", "utf8"));
			const { rows } = await client.query<{ id: string; legacyPublicationImagesExempt: boolean }>(`SELECT "id", "legacyPublicationImagesExempt" FROM "Work" ORDER BY "id"`);
			const exemptions = new Map(rows.map(row => [row.id, row.legacyPublicationImagesExempt]));
			expect(exemptions.get(publishedId)).toBe(true);
			expect(exemptions.get(oldDraftId)).toBe(true);
			expect(exemptions.get(neverPublishedId)).toBe(false);
			// A reader compiled before the new columns still projects its original fields.
			const previousReader = await client.query(`SELECT "id", "coverAssetId", "incapBannerAssetId" FROM "Work"`);
			expect(previousReader.rows).toHaveLength(3);
		} finally { await client.end(); }
	});
});
