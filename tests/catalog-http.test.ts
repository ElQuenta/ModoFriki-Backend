import "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { withServer } from "./fixtures";

const workId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";

async function setup(forbidden = false, failSave = false) {
  const { createCatalogRouter } = await import("../src/routes/catalog.routes");
  const { default: AppError } = await import("../src/utils/AppError");
  const calls: any[] = [];
  const context = { workId, workSlug: "sample-1111", actorId: "actor" };
  const service: any = {
    preflight: async (...args: any[]) => { calls.push(["preflight", ...args]); if (forbidden) throw new AppError("Forbidden", 403); },
    prepare: async (...args: any[]) => { calls.push(["prepare", ...args]); return { plan: { context, objects: [] }, prepared: { context, data: args[1] } }; },
    save: async (...args: any[]) => { calls.push(["save", ...args]); if (failSave) throw new AppError("Conflict", 409); return { id: workId, sizeBytes: 100n }; },
    abort: async (context: any) => calls.push(["abort", context]),
    getChapter: async (...args: any[]) => { calls.push(["getChapter", ...args]); return { id: chapterId, pages: [] }; }
  };
  const auth: any = { authenticateToken: async () => ({ id: "actor", role: "ADMIN" }) };
  const app = express();
  app.use(express.json());
  app.use("/api", createCatalogRouter(service, auth));
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ code: error.statusCode ?? 500 }));
  return { app, calls };
}

test("real router rejects unauthenticated and unauthorized malformed multipart before Multer", async () => {
  for (const authorized of [false, true]) {
    const { app, calls } = await setup(true);
    await withServer(app, async (base) => {
      const headers: any = { "content-type": "multipart/form-data; boundary=broken" };
      if (authorized) headers.authorization = "Bearer fake";
      const response = await fetch(`${base}/api/works/${workId}`, { method: "PUT", headers, body: "malformed" });
      assert.equal(response.status, authorized ? 403 : 401);
      assert.ok(!calls.some(c => c[0] === "prepare"));
      assert.ok(!calls.some(c => c[0] === "save"));
    });
  }
});

test("real work and chapter PUT JSON reach controller without files or Blob configuration", async () => {
  for (const [path, body, mode] of [
    [`/works/${workId}`, { expectedUpdatedAt: "2026-01-01T00:00:00Z", title: "Renamed" }, "editWork"],
    [`/works/${workId}/chapters/${chapterId}`, { expectedVersion: 1, title: "Renamed" }, "editChapter"]
  ] as const) {
    const { app, calls } = await setup();
    await withServer(app, async (base) => {
      const response = await fetch(`${base}/api${path}`, { method: "PUT", headers: { authorization: "Bearer fake", "content-type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, code: 200, data: { id: workId, sizeBytes: "100" } });
      const prepared = calls.find(c => c[0] === "prepare");
      assert.equal(prepared[1], mode);
      assert.deepEqual(prepared[3], []);
      assert.equal(prepared[5], workId);
      assert.deepEqual(calls.find(c => c[0] === "save")[2], []);
    });
  }
});

test("invalid UUID, missing version and client Blob metadata fail before preparation", async () => {
  for (const [id, body] of [["bad-id", { expectedUpdatedAt: "2026-01-01T00:00:00Z" }], [workId, { title: "No version" }], [workId, { expectedUpdatedAt: "2026-01-01T00:00:00Z", url: "https://evil.invalid" }]] as const) {
    const { app, calls } = await setup();
    await withServer(app, async (base) => {
      const response = await fetch(`${base}/api/works/${id}`, { method: "PUT", headers: { authorization: "Bearer fake", "content-type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
      assert.ok(!calls.some(c => c[0] === "prepare"));
    });
  }
});

test("controller extracts nested chapter identifiers and public reads require no token", async () => {
  const { app, calls } = await setup();
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/works/${workId}/chapters/${chapterId}`);
    assert.equal(response.status, 200);
    assert.deepEqual(calls[0], ["getChapter", workId, chapterId, undefined]);
  });
});

test("controller persistence failure invokes compensation and preserves conflict response", async () => {
  const { app, calls } = await setup(false, true);
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/works/${workId}`, { method: "PUT", headers: { authorization: "Bearer fake", "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-01-01T00:00:00Z", title: "Renamed" }) });
    assert.equal(response.status, 409);
    assert.equal(calls.at(-1)[0], "abort");
    assert.equal(calls.at(-1)[1].workId, workId);
  });
});
