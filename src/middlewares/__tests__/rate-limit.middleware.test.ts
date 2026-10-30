import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRateLimit } from "../rate-limit.middleware";

describe("createRateLimit", () => {
	let base = "";
	let close = () => {};

	beforeAll(async () => {
		const app = express();
		app.get("/limited", createRateLimit(60_000, 2, "Too many requests"), (_req, res) => { res.json({ ok: true }); });
		app.get("/skippable", createRateLimit(60_000, 1, "Too many events", req => Boolean(req.headers.authorization)), (_req, res) => { res.json({ ok: true }); });
		const server = app.listen(0);
		await new Promise(resolve => server.once("listening", resolve));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		close = () => server.close();
	});
	afterAll(() => close());

	it("deja pasar hasta el límite y luego responde 429 con el sobre de error", async () => {
		expect((await fetch(`${base}/limited`)).status).toBe(200);
		expect((await fetch(`${base}/limited`)).status).toBe(200);
		const blocked = await fetch(`${base}/limited`);
		expect(blocked.status).toBe(429);
		expect(await blocked.json()).toEqual({ success: false, code: 429, error: { message: "Too many requests" } });
		expect(blocked.headers.get("ratelimit-policy")).toBeTruthy();
	});

	it("no cuenta las peticiones que cumplen skip (con token)", async () => {
		const auth = { headers: { authorization: "Bearer x" } };
		for (let i = 0; i < 3; i++) expect((await fetch(`${base}/skippable`, auth)).status).toBe(200);
		expect((await fetch(`${base}/skippable`)).status).toBe(200);
		expect((await fetch(`${base}/skippable`)).status).toBe(429);
	});
});
