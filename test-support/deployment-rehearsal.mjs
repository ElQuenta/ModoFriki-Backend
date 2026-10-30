// Operational rehearsal against a NEW loopback runtime only. No application .env is loaded.
// node test-support/deployment-rehearsal.mjs <runtime.json> <compatible-rollback-entry>
// runtime.json: { runRoot, pgBin, pgPort, mongoPort }; binaries provisioned separately.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile, cp, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");
const { MongoClient, BSON } = require("mongoose").mongo;
const runtime = JSON.parse(await readFile(process.argv[2], "utf8"));
const rollbackEntry = resolve(process.argv[3]);
assert(runtime.runRoot && runtime.pgBin && Number.isInteger(runtime.pgPort) && Number.isInteger(runtime.mongoPort));
const tag = randomUUID().replaceAll("-", "");
const root = resolve(runtime.runRoot, `rehearsal-${tag}`); await mkdir(root, { recursive: true });
const sourceName = `mf_admin_test_cutover_${tag}`, restoredName = `mf_admin_test_restore_${tag}`;
const pgUrl = name => `postgresql://postgres@127.0.0.1:${runtime.pgPort}/${name}?sslmode=disable`;
const mongoUrl = name => `mongodb://127.0.0.1:${runtime.mongoPort}/${name}?directConnection=true`;
const admin = new Client({ connectionString: pgUrl("postgres") }); await admin.connect();
const mongo = new MongoClient(mongoUrl(sourceName)); await mongo.connect();
const migrations = (await import("node:fs/promises")).readdir;
const names = (await migrations("prisma/migrations")).filter(n => /^\d/.test(n)).sort();
const finalMigration = "20261029000300_work_detail_banner";
const cutoverIndex = names.indexOf(finalMigration); assert(cutoverIndex > 0);
const events = []; let app;
async function artifactHash(directory) {
	const hash = createHash("sha256");
	async function walk(base, relative = "") {
		for (const item of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const file = join(base, item.name), key = relative + item.name;
			if (item.isDirectory()) await walk(file, `${key}/`);
			else if (item.isFile()) { hash.update(key); hash.update(await readFile(file)); }
		}
	}
	await walk(directory); return hash.digest("hex");
}
function run(binary, args, env = process.env, success = true) {
	const result = spawnSync(binary, args, { env, encoding: "utf8", windowsHide: true, timeout: 120_000 });
	if (success) assert.equal(result.status, 0, `${binary.split(/[\\/]/).at(-1)} failed (output suppressed)`);
	else assert.notEqual(result.status, 0, "Injected failure must fail");
	return result;
}
async function migrate(name, dir, fail = false) {
	const config = join(root, `${name}.config.mjs`);
	const project = join(root, `migrate-${randomUUID()}`); await mkdir(project);
	await cp("prisma/schema.prisma", join(project, "schema.prisma"));
	await cp(dir, join(project, "migrations"), { recursive: true });
	const prismaConfigModule = (await import("node:url")).pathToFileURL(resolve("node_modules/prisma/config.js")).href;
	await writeFile(config, `import { defineConfig } from ${JSON.stringify(prismaConfigModule)}; export default defineConfig(${JSON.stringify({ schema: join(project, "schema.prisma"), migrations: { path: join(project, "migrations") }, datasource: { url: pgUrl(name) } })});`);
	const output = run(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", config], { ...process.env, DATABASE_URL: pgUrl(name) }, !fail);
	await writeFile(join(root, `${name}.migration.log`), output.stdout + output.stderr);
}
async function sql(name, operation) {
	const client = new Client({ connectionString: pgUrl(name) }); await client.connect();
	try { return await operation(client); } finally { await client.end(); }
}
async function stopApp() {
	if (!app) return;
	const child = app; app = undefined;
	if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
	assert.notEqual(child.exitCode, undefined);
}
async function startApp(name, entry) {
	assert(!app, "No mixed application generations");
	const { createServer } = await import("node:net");
	const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
	const port = reservation.address().port; await new Promise(r => reservation.close(r));
	app = spawn(process.execPath, [entry], { windowsHide: true, stdio: "ignore", env: {
		...process.env, NODE_ENV: "test", PORT: String(port), DATABASE_URL: pgUrl(name), MONGODB_URI: mongoUrl(name),
		JWT_SECRET: "rehearsal-only-secret-never-production-0001", BLOB_READ_WRITE_TOKEN: "", LOG_LEVEL: "error"
	} });
	for (let n = 0; n < 100; n++) {
		assert.equal(app.exitCode, null, "Application exited before health");
		try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.ok) return `http://127.0.0.1:${port}`; } catch {}
		await new Promise(r => setTimeout(r, 100));
	}
	throw new Error("Health timeout");
}
try {
	// Refuse an existing replica set of unknown ownership; caller supplies a newly provisioned runtime.
	const hello = await mongo.db("admin").command({ hello: 1 });
	if (!hello.setName) await mongo.db("admin").command({ replSetInitiate: { _id: "mf_phase7", members: [{ _id: 0, host: `127.0.0.1:${runtime.mongoPort}` }] } });
	for (let n = 0; n < 100; n++) {
		const status = await mongo.db("admin").command({ hello: 1 });
		if (status.isWritablePrimary && status.setName) break;
		assert(n < 99, "Replica set primary unavailable"); await new Promise(r => setTimeout(r, 100));
	}
	await admin.query(`CREATE DATABASE "${sourceName}"`); await admin.query(`CREATE DATABASE "${restoredName}"`);
	const before = join(root, "before"); await mkdir(before);
	await cp("prisma/migrations/migration_lock.toml", join(before, "migration_lock.toml"));
	for (const name of names.slice(0, cutoverIndex)) await cp(`prisma/migrations/${name}`, join(before, name), { recursive: true });
	await migrate(sourceName, before);
	// Legacy Example is deliberately absent from the migration chain. Model that existing table
	// explicitly in this disposable fixture; never fabricate a baseline migration entry.
	await sql(sourceName, async c => {
		await c.query('CREATE TABLE "Example" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)');
		await c.query('INSERT INTO "Example" DEFAULT VALUES');
	});
	const userId = randomUUID(), typeId = randomUUID(), coverId = randomUUID();
	const workIds = [randomUUID(), randomUUID(), randomUUID()];
	const ids = { legacy: randomUUID(), committed: randomUUID(), prepared: randomUUID(), rejected: randomUUID() };
	await sql(sourceName, async c => {
		await c.query(`INSERT INTO "User" (id,email,"emailNormalized",username,"usernameNormalized","passwordHash","updatedAt") VALUES ($1,$2,$2,$3,$3,'fixture',now())`, [userId, `${tag}@test.invalid`, `test_${tag}`]);
		await c.query(`INSERT INTO "WorkType" (id,name,slug) VALUES ($1,'fixture',$2)`, [typeId, tag]);
		await c.query(`INSERT INTO "MediaAsset" (id,pathname,url,"contentType","sizeBytes","createdById") VALUES ($1,$2,'https://fixtures.invalid/cover.png','image/png',1,$3)`, [coverId, tag, userId]);
		for (const [index, workId] of workIds.entries()) await c.query(`INSERT INTO "Work" (id,title,slug,synopsis,"typeId","publicationStatus","coverAssetId","createdById","updatedById","publishedAt","updatedAt") VALUES ($1,$7,$7,'fixture',$2,$3,$4,$5,$5,$6,now())`, [workId, typeId, index === 0 ? "PUBLISHED" : "DRAFT", coverId, userId, index === 2 ? null : new Date(), workId]);
		for (const state of ["committed", "prepared", "rejected"]) await c.query(`INSERT INTO "CommentCreationDecision" (id,"authorId",state,"requestFingerprint","preparedAt","expiresAt","decidedAt","rejectionCode") VALUES ($1,$2,$3,$4,now(),now()+interval '60 seconds',CASE WHEN $5 THEN now() ELSE NULL END,$6)`, [ids[state], userId, state.toUpperCase(), "a".repeat(64), state !== "prepared", state === "rejected" ? "SANCTIONED" : null]);
	});
	const collection = mongo.db(sourceName).collection("comments");
	await collection.createIndex({ creationOperationId: 1 }, { unique: true, partialFilterExpression: { creationOperationId: { $type: "string" } } });
	await collection.insertMany(Object.entries(ids).map(([state, id]) => ({ _id: id, ...(state === "legacy" ? {} : { creationOperationId: id }), authorId: userId, targetType: "WORK", targetId: workIds[0], parentCommentId: null, rootCommentId: id, bodyMarkdown: state, status: "ACTIVE", revision: 0, createdAt: new Date(), updatedAt: new Date() })), { writeConcern: { w: "majority" } });
	// All producers/readers are under the supervisor: drain requests then await process exit before backup.
	await startApp(sourceName, rollbackEntry); await stopApp(); events.push("exclusive-process-stop-before-backup");
	const dump = join(root, "before.dump");
	run(join(runtime.pgBin, process.platform === "win32" ? "pg_dump.exe" : "pg_dump"), ["-h", "127.0.0.1", "-p", String(runtime.pgPort), "-U", "postgres", "-d", sourceName, "-Fc", "-f", dump]);
	const documents = await collection.find().toArray(), indexes = await collection.indexes();
	const mongoBackup = join(root, "comments.ejson"); await writeFile(mongoBackup, BSON.EJSON.stringify({ documents, indexes }, { relaxed: false }));
	const damaged = join(root, "failed"); await cp(before, damaged, { recursive: true });
	await cp(`prisma/migrations/${finalMigration}`, join(damaged, finalMigration), { recursive: true });
	const finalSql = await readFile(join(damaged, finalMigration, "migration.sql"), "utf8");
	await writeFile(join(damaged, finalMigration, "migration.sql"), finalSql.replace("COMMIT;", "SELECT 1/0;\nCOMMIT;"));
	await migrate(sourceName, damaged, true);
	await sql(sourceName, async c => {
		assert.equal((await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name='Work' AND column_name='bannerAssetId'`)).rowCount, 0);
		assert.equal((await c.query(`SELECT 1 FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NULL`, [finalMigration])).rowCount, 1);
	}); events.push("injected-migration-failure-rolled-back-and-recorded");
	// Restore into a different empty database. Preserve failed destination and backups for inspection.
	run(join(runtime.pgBin, process.platform === "win32" ? "pg_restore.exe" : "pg_restore"), ["-h", "127.0.0.1", "-p", String(runtime.pgPort), "-U", "postgres", "-d", restoredName, "--exit-on-error", dump]);
	const saved = BSON.EJSON.parse(await readFile(mongoBackup, "utf8"), { relaxed: false });
	const restored = mongo.db(restoredName).collection("comments"); await restored.insertMany(saved.documents);
	for (const index of saved.indexes.filter(i => i.name !== "_id_")) await restored.createIndex(index.key, { ...(index.unique === undefined ? {} : { unique: index.unique }), ...(index.partialFilterExpression === undefined ? {} : { partialFilterExpression: index.partialFilterExpression }), name: index.name });
	assert.deepEqual(await restored.find().sort({ _id: 1 }).toArray(), await collection.find().sort({ _id: 1 }).toArray());
	assert.equal((await restored.indexes()).length, indexes.length); events.push("sql-and-mongo-fixture-backup-restored");
	await migrate(restoredName, resolve("prisma/migrations"));
	const drift = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-config-datasource", "--to-schema", resolve("prisma/schema.prisma"), "--exit-code", "--config", join(root, `${restoredName}.config.mjs`)], { env: { ...process.env, DATABASE_URL: pgUrl(restoredName) }, encoding: "utf8", windowsHide: true });
	await writeFile(join(root, "schema-diff.log"), drift.stdout + drift.stderr);
	assert.equal(drift.status, 0, `Schema drift check failed; inspect ${join(root, "schema-diff.log")}`);
	events.push("prisma-schema-drift-check-pass");
	await sql(restoredName, async c => {
		const history = (await c.query(`SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`)).rows;
		assert.deepEqual(history.map(r => r.migration_name), names);
		for (const row of history) assert.equal(row.checksum, createHash("sha256").update(await readFile(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"));
		const rows = (await c.query(`SELECT id,"legacyPublicationImagesExempt" AS exempt FROM "Work"`)).rows;
		for (const [i, id] of workIds.entries()) assert.equal(rows.find(r => r.id === id).exempt, i !== 2);
		assert.equal((await c.query(`SELECT count(*)::int AS n FROM "CommentCreationDecision"`)).rows[0].n, 3);
		assert.equal((await c.query('SELECT count(*)::int AS n FROM "Example"')).rows[0].n, 1);
	}); events.push("migration-history-checksums-and-fixed-exemption");
	for (const [release, entry] of [["candidate", resolve("dist/index.js")], ["compatible-rollback", rollbackEntry]]) {
		const url = await startApp(restoredName, entry);
		const response = await fetch(`${url}/api/comments?targetType=WORK&targetId=${workIds[0]}`);
		assert.equal(response.status, 200); const body = await response.json();
		assert.deepEqual(body.data.items.map(i => i.id).sort(), [ids.legacy, ids.committed].sort());
		await stopApp(); events.push(`${release}-health-and-publication-filter-pass`);
	}
	await sql(restoredName, async c => assert.equal((await c.query(`SELECT count(*)::int AS n FROM "CommentCreationDecision"`)).rows[0].n, 3));
	assert.equal(await restored.countDocuments(), 4); events.push("no-history-or-provisional-purge");
	const versions = { node: process.version, postgres: (await admin.query("SHOW server_version")).rows[0].server_version, mongo: (await mongo.db("admin").command({ buildInfo: 1 })).version };
	const artifacts = { candidate: await artifactHash(resolve("dist")), compatibleRollback: await artifactHash(resolve(rollbackEntry, "..")) };
	await writeFile(join(root, "result.json"), JSON.stringify({ status: "PASS", sourceName, restoredName, pgPort: runtime.pgPort, mongoPort: runtime.mongoPort, versions, artifacts, events, limitations: ["Dedicated fixture backup only; not a production backup procedure", "Supervisor owns all rehearsal processes; shared hosting exclusion still requires verification", "Mongo backup covers the comments fixture collection and its indexes, not votes/reports", "No Blob calls; referenced bytes remain outside SQL/Mongo backups"] }, null, 2));
	console.log(JSON.stringify({ status: "PASS", events, result: join(root, "result.json") }));
} finally { await stopApp(); await mongo.close(); await admin.end(); }
