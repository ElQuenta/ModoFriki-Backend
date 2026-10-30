import { describe, expect, it } from "vitest";
import { createBarrier, createFixtureScope } from "./helpers/fixtures";
import { startHttpServer } from "./helpers/http";

describe("test helpers without providers", () => {
	it("pauses at a deterministic barrier and only continues after release", async () => {
		const barrier = createBarrier();
		let completed = false;
		const operation = barrier.pause().then(() => { completed = true; });
		try { await barrier.reached; expect(completed).toBe(false); }
		finally { barrier.release(); }
		await operation;
		expect(completed).toBe(true);
	});
	it("cleans only owned UUIDs in reverse order and closes the scope", async () => {
		const scope = createFixtureScope();
		const first = scope.id(), second = scope.id();
		const cleaned: string[] = [];
		expect(() => scope.track("not-owned", async () => {})).toThrow("owned");
		scope.track(first, async id => { cleaned.push(id); });
		scope.track(second, async id => { cleaned.push(id); });
		await scope.dispose();
		await scope.dispose();
		expect(cleaned).toEqual([second, first]);
		expect(() => scope.id()).toThrow("closed");
	});
	it("continues cleanup after a fixture failure without exposing provider errors", async () => {
		const scope = createFixtureScope();
		let cleaned = false;
		scope.track(scope.id(), async () => { cleaned = true; });
		scope.track(scope.id(), async () => { throw new Error("private-provider-error"); });
		await expect(scope.dispose()).rejects.toThrow("Failed to clean 1 owned fixtures");
		expect(cleaned).toBe(true);
	});
	it("serves HTTP through loopback fetch, rejects external URLs and closes idempotently", async () => {
		const server = await startHttpServer((_req, res) => { res.end("ok"); });
		try {
			expect(await (await server.request("/")).text()).toBe("ok");
			expect(() => server.request("//example.com/")).toThrow("local server");
		} finally { await server.close(); }
		await server.close();
	});
});
