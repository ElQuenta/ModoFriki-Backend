// Entorno desechable de pruebas (Windows/macOS/Linux). Nunca toca la DB compartida de Render.
//   node postman/test-env.mjs up      → levanta Postgres + Mongo, migra, seed y carga fixtures
//   node postman/test-env.mjs server  → backend en :3000 apuntando a esas bases
//   node postman/test-env.mjs integration → tests de integración (Vitest) contra esas bases
//   node postman/test-env.mjs down    → borra contenedores y volúmenes
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEST_ENV = {
	DATABASE_URL: "postgresql://postgres:postgres@localhost:55432/modofriki?schema=public&sslmode=disable",
	MONGODB_URI: "mongodb://localhost:27027/modofriki_test?directConnection=true",
	BLOB_READ_WRITE_TOKEN: "",
	// Autosuficiente sin .env (CI). Solo vale para la DB desechable.
	JWT_SECRET: "test-only-secret-modofriki-disposable-env-0001",
	// Las colecciones y el E2E repiten login/registro muchas veces seguidas.
	RATE_LIMIT_AUTH_PER_15_MINUTES: "1000",
	RATE_LIMIT_API_PER_MINUTE: "5000",
	RATE_LIMIT_EVENTS_PER_MINUTE: "1000"
};
const env = { ...process.env, ...TEST_ENV };
const compose = ["compose", "-f", "docker-compose.test.yml"];

function run(command, args, options = {}) {
	console.log(`> ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32", ...options });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

const actions = {
	up() {
		run("docker", [...compose, "up", "-d", "--wait"]);
		run("npx", ["prisma", "migrate", "deploy"]);
		run("npx", ["prisma", "db", "seed"]);
		run("docker", ["exec", "-i", "modofriki-test-pg", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-U", "postgres", "-d", "modofriki"], {
			input: readFileSync("postman/fixtures/test-data.sql"), stdio: ["pipe", "inherit", "inherit"]
		});
		console.log("Entorno de pruebas listo. Siguiente: npm run test:env:server");
	},
	server() {
		spawn("npx", ["tsx", "src/index.ts"], { stdio: "inherit", env, shell: process.platform === "win32" })
			.on("exit", code => process.exit(code ?? 0));
	},
	// Base propia en el mismo Postgres: los tests de integración crean obras y capítulos que, en la base
	// "modofriki", desplazarían los fixtures que esperan la colección Postman y el E2E.
	// El nombre cumple la guardia de test-support/integration-environment.ts (mf_admin_test_<id>).
	integration() {
		const name = "mf_admin_test_integration";
		const exists = spawnSync("docker", ["exec", "modofriki-test-pg", "psql", "-U", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname = '${name}'`], { encoding: "utf8" });
		if (exists.status !== 0) process.exit(exists.status ?? 1);
		if (exists.stdout.trim() !== "1") run("docker", ["exec", "modofriki-test-pg", "createdb", "-U", "postgres", name]);
		const databaseUrl = `postgresql://postgres:postgres@localhost:55432/${name}?sslmode=disable`;
		const integrationEnv = { ...env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl, TEST_MONGODB_URI: `mongodb://localhost:27027/${name}?directConnection=true` };
		run("npx", ["prisma", "migrate", "deploy"], { env: integrationEnv });
		run("npx", ["vitest", "run", "--config", "vitest.integration.config.ts"], { env: integrationEnv });
	},
	down() {
		run("docker", [...compose, "down", "-v"]);
	}
};

const action = actions[process.argv[2]];
if (!action) {
	console.error("Uso: node postman/test-env.mjs <up|server|integration|down>");
	process.exit(1);
}
action();
