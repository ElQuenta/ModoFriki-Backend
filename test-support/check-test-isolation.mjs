import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const cli = resolve("node_modules/vitest/vitest.mjs");
const clean = { ...process.env }; delete clean.TEST_DATABASE_URL; delete clean.TEST_MONGODB_URI;
const testEnv = { ...clean, TEST_DATABASE_URL: "postgresql://test@127.0.0.1:1/mf_admin_test_inventory?sslmode=disable", TEST_MONGODB_URI: "mongodb://127.0.0.1:1/mf_admin_test_inventory?directConnection=true" };
function list(config, env) {
	const r = spawnSync(process.execPath, [cli, "list", "--filesOnly", "--json", "--config", config], { env, encoding: "utf8", windowsHide: true });
	assert.equal(r.status, 0, `${config}: ${r.stderr}`);
	return JSON.parse(r.stdout).map(file => typeof file === "string" ? file : file.file);
}
const unit = list("vitest.config.ts", clean), integration = list("vitest.integration.config.ts", testEnv);
assert(unit.length && integration.length);
assert(unit.every(f => !integration.includes(f)), "Suite inventories overlap");
const missing = spawnSync(process.execPath, [cli, "run", "--config", "vitest.integration.config.ts"], { env: clean, encoding: "utf8", windowsHide: true });
assert.notEqual(missing.status, 0); assert(missing.stderr.includes("TEST_DATABASE_URL is required"));
console.log(JSON.stringify({ status: "PASS", unitFiles: unit.length, integrationFiles: integration.length, intersection: 0, absentDestinations: "rejected before collection" }));
