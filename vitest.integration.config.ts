import { configDefaults, defineConfig } from "vitest/config";
import { integrationEnvironment } from "./test-support/integration-environment";

// Evaluated before collecting/importing tests. No fallback to application or unit URLs.
const env = integrationEnvironment(process.env);

export default defineConfig({
	test: {
		include: ["src/**/__tests__/**/*.integration.test.ts"],
		exclude: [...configDefaults.exclude],
		environment: "node",
		env,
		fileParallelism: false,
		testTimeout: 15_000,
		hookTimeout: 15_000
	}
});
