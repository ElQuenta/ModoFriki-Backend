import { configDefaults, defineConfig } from "vitest/config";
import { integrationEnvironment } from "./test-support/integration-environment";

// Evaluated before collecting/importing tests. No fallback to application or unit URLs.
// `npm run test:integration` sets TEST_DATABASE_URL/TEST_MONGODB_URI to the disposable
// docker-compose.test.yml servers (database mf_admin_test_integration).
const env = integrationEnvironment(process.env);

export default defineConfig({
	test: {
		include: ["src/**/__tests__/**/*.integration.test.ts", "src/**/__integration__/**/*.int.test.ts"],
		exclude: [...configDefaults.exclude],
		environment: "node",
		env,
		// Second guard for the __integration__ suites, which write and drop data.
		setupFiles: ["src/__integration__/guard.ts"],
		fileParallelism: false,
		testTimeout: 15_000,
		// First Prisma connection and fixture creation can be slow on cold machines.
		hookTimeout: 60_000
	}
});
