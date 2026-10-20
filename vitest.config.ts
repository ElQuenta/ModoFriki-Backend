import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/__tests__/**/*.test.ts"],
		environment: "node",
		// Valores ficticios: env.ts valida al importar y los tests nunca abren conexiones reales.
		env: {
			NODE_ENV: "test",
			DATABASE_URL: "postgresql://test:test@localhost:5432/test",
			MONGODB_URI: "mongodb://localhost:27017/test",
			JWT_SECRET: "test-secret-test-secret-test-secret-123",
			BCRYPT_SALT_ROUNDS: "4",
			LOG_LEVEL: "error"
		}
	}
});
