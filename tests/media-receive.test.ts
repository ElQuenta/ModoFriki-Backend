import "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import express from "express";
import { png, withServer } from "./fixtures";

async function application(kind: "work" | "chapter" = "work", authorized = true) {
  const { receiveWorkMedia, receiveChapterMedia } = await import("../src/middlewares/media/receive.middleware");
  const app = express();
  const observed = { received: 0, paths: [] as string[] };
  app.use(express.json());
  app.post("/upload", (_req, res, next) => authorized ? next() : res.status(403).json({ code: 403 }),
    kind === "work" ? receiveWorkMedia() : receiveChapterMedia(), (_req, res) => {
      observed.received++;
      observed.paths = res.locals.receivedImages.map((image: any) => image.path);
      res.json({ count: observed.paths.length });
    });
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ code: error.statusCode ?? 500 }));
  return { app, observed };
}

test("metadata-only JSON skips Multer and preserves an empty received collection", async () => {
  const { app } = await application();
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Updated title" }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { count: 0 });
  });
});

test("one cover and one inpagecover are received; hostile names never become disk paths", async () => {
  const { app, observed } = await application();
  await withServer(app, async (base) => {
    const body = new FormData();
    body.append("cover", new Blob([png], { type: "image/png" }), "../../secret.png");
    body.append("inpagecover", new Blob([png], { type: "image/png" }), "banner.png");
    const response = await fetch(`${base}/upload`, { method: "POST", body });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { count: 2 });
    for (const path of observed.paths) assert.match(path, /modofriki-media-[^\\/]+[\\/][a-f\d-]{36}$/);
  });
  // Response completion schedules asynchronous temporary-file cleanup.
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const path of observed.paths) await assert.rejects(access(path));
});

test("chapter accepts one or several pages in request order", async () => {
  for (const count of [1, 3]) {
    const { app } = await application("chapter");
    await withServer(app, async (base) => {
      const body = new FormData();
      for (let index = 0; index < count; index++) body.append("pages", new Blob([png]), `${index}.png`);
      const response = await fetch(`${base}/upload`, { method: "POST", body });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { count });
    });
  }
});

test("duplicate cover and unexpected fields fail before controller", async () => {
  for (const fields of [["cover", "cover"], ["unexpected"]]) {
    const { app, observed } = await application();
    await withServer(app, async (base) => {
      const body = new FormData();
      for (const field of fields) body.append(field, new Blob([png]), "image.png");
      const response = await fetch(`${base}/upload`, { method: "POST", body });
      assert.equal(response.status, 400);
      assert.equal(observed.received, 0);
    });
  }
});

test("image above 10 MiB is rejected with 413", async () => {
  const { app, observed } = await application();
  await withServer(app, async (base) => {
    const body = new FormData();
    body.append("cover", new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)]), "large.png");
    const response = await fetch(`${base}/upload`, { method: "POST", body });
    assert.equal(response.status, 413);
    assert.equal(observed.received, 0);
  });
});

test("authorization rejection happens before multipart parsing", async () => {
  const { app, observed } = await application("work", false);
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/upload`, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=broken" }, body: "deliberately malformed" });
    assert.equal(response.status, 403);
    assert.equal(observed.received, 0);
  });
});
