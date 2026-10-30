import { defineConfig } from "vitest/config";

// Integration tests: real PostgreSQL from docker-compose.test.yml (or the CI service), never Render.
// Run with `npm run test:integration` (sets DATABASE_URL to the disposable database).
export default defineConfig({
	test: {
		include: ["src/**/__integration__/**/*.int.test.ts"],
		environment: "node",
		setupFiles: ["src/__integration__/guard.ts"],
		fileParallelism: false,
		testTimeout: 60_000,
		hookTimeout: 60_000,
		env: {
			NODE_ENV: "test",
			MONGODB_URI: "mongodb://localhost:27017/unused",
			JWT_SECRET: "test-secret-test-secret-test-secret-123",
			BCRYPT_SALT_ROUNDS: "4",
			LOG_LEVEL: "error"
		}
	}
});
