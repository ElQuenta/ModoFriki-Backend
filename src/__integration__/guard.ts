// Integration tests write and drop data: refuse anything that is not a local/CI disposable database.
const url = process.env.DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();

if (!["localhost", "127.0.0.1", "postgres"].includes(host)) {
	throw new Error(`Integration tests only run against a disposable database (localhost or the CI "postgres" service). DATABASE_URL host: "${host || "missing"}". Use npm run test:integration.`);
}
