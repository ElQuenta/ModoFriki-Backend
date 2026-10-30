/** Pure configuration guard: no dotenv, application imports, clients or network effects. */
export function integrationEnvironment(env: Record<string, string | undefined>) {
	function destination(key: "TEST_DATABASE_URL" | "TEST_MONGODB_URI", protocol: string) {
		const value = env[key];
		if (!value) throw new Error(`${key} is required for disposable integration tests`);
		let url: URL;
		try { url = new URL(value); } catch { throw new Error(`${key} must be a valid disposable test URL`); }
		const allowedProtocols = protocol === "postgresql:" ? ["postgresql:", "postgres:"] : ["mongodb:"];
		if (!allowedProtocols.includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
			|| url.hash || !/^\/mf_admin_test_[a-z0-9_]{8,64}$/.test(url.pathname)) {
			throw new Error(`${key} must target a dedicated loopback database named mf_admin_test_<run id>`);
		}
		const allowedOptions = protocol === "postgresql:" ? ["sslmode", "schema"] : ["replicaSet", "directConnection", "authSource", "tls"];
		for (const option of url.searchParams.keys()) {
			if (!allowedOptions.includes(option) || url.searchParams.getAll(option).length !== 1) throw new Error(`${key} contains an unsupported connection option`);
		}
		if (protocol === "postgresql:" && url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") {
			throw new Error(`${key} must use the public schema of the disposable database`);
		}
		// Replica-set discovery must not redirect this harness to unverified hosts.
		if (protocol === "mongodb:" && url.searchParams.get("directConnection") !== "true") {
			throw new Error(`${key} requires directConnection=true for the verified loopback server`);
		}
		return value;
	}
	return {
		NODE_ENV: "test",
		DATABASE_URL: destination("TEST_DATABASE_URL", "postgresql:"),
		MONGODB_URI: destination("TEST_MONGODB_URI", "mongodb:"),
		JWT_SECRET: "integration-test-secret-not-a-production-key-123",
		BCRYPT_SALT_ROUNDS: "4",
		LOG_LEVEL: "error",
		// Provider uploads require a separate explicit test store; never inherit a token.
		BLOB_READ_WRITE_TOKEN: ""
	};
}
