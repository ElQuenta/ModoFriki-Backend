// Import before application modules: never use application credentials in these tests.
Object.assign(process.env, {
	NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
	MONGODB_URI: "mongodb://127.0.0.1:1/test", JWT_SECRET: "isolated-test-secret-with-at-least-32-characters",
	BCRYPT_SALT_ROUNDS: "4", LOG_LEVEL: "error", NO_COLOR: "1", DOTENV_CONFIG_QUIET: "true"
});
