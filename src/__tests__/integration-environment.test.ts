import { describe, expect, it } from "vitest";
import { integrationEnvironment } from "../../test-support/integration-environment";

const valid = {
	TEST_DATABASE_URL: "postgresql://fixture:synthetic@127.0.0.1:55432/mf_admin_test_12345678?sslmode=disable",
	TEST_MONGODB_URI: "mongodb://127.0.0.1:27027/mf_admin_test_12345678?replicaSet=rs0&directConnection=true"
};

describe("integration destination guard (no clients)", () => {
	it("requires both explicit TEST URLs without falling back to application URLs", () => {
		expect(() => integrationEnvironment({ DATABASE_URL: valid.TEST_DATABASE_URL, MONGODB_URI: valid.TEST_MONGODB_URI })).toThrow("TEST_DATABASE_URL is required");
		expect(() => integrationEnvironment({ TEST_DATABASE_URL: valid.TEST_DATABASE_URL })).toThrow("TEST_MONGODB_URI is required");
	});
	it("maps verified destinations before application imports and suppresses inherited Blob credentials", () => {
		const env = integrationEnvironment({ ...valid, BLOB_READ_WRITE_TOKEN: "do-not-use" });
		expect(env).toMatchObject({ NODE_ENV: "test", DATABASE_URL: valid.TEST_DATABASE_URL, MONGODB_URI: valid.TEST_MONGODB_URI, BLOB_READ_WRITE_TOKEN: "" });
	});
	it.each([
		"postgresql://user:private-secret@example.com/mf_admin_test_12345678",
		"postgresql://localhost/production",
		"postgresql://localhost/mf_admin_test_12345678?host=production",
		"postgresql://localhost/mf_admin_test_12345678?schema=shared",
		"postgresql://localhost/mf_admin_test_12345678?sslmode=disable&sslmode=require",
		"postgresql://localhost/mf_admin_test_12345678#fragment",
		"not-a-url-private-secret"
	])("rejects unverified SQL targets without reflecting secrets", url => {
		let error: unknown;
		try { integrationEnvironment({ ...valid, TEST_DATABASE_URL: url }); } catch (caught) { error = caught; }
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).not.toContain("private-secret");
	});
	it.each([
		"mongodb://localhost/admin",
		"mongodb+srv://cluster.example.com/mf_admin_test_12345678",
		"mongodb://localhost:27017,remote:27017/mf_admin_test_12345678",
		"mongodb://localhost/mf_admin_test_12345678?proxyHost=remote",
		"mongodb://localhost/mf_admin_test_12345678?replicaSet=rs0",
		"mongodb://localhost/mf_admin_test_12345678?directConnection=false"
	])("rejects unverified Mongo targets", url => {
		expect(() => integrationEnvironment({ ...valid, TEST_MONGODB_URI: url })).toThrow(/TEST_MONGODB_URI/);
	});
});
