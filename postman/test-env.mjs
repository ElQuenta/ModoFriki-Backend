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
	BLOB_READ_WRITE_TOKEN: ""
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
	integration() {
		run("npx", ["vitest", "run", "--config", "vitest.integration.config.ts"]);
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
