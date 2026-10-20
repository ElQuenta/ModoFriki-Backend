import "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { png } from "./fixtures";

async function setup(objects?: any[]) {
  const { uploadMedia } = await import("../src/middlewares/media/upload.middleware");
  const events: string[] = [];
  const repository: any = {
    beginBatch: async () => { events.push("begin"); return { id: "batch" }; },
    planObject: async (_batch: string, path: string) => { events.push(`plan:${path}`); return { id: path }; },
    markUploaded: async (_batch: string, path: string) => { events.push(`uploaded:${path}`); },
    abandonBatch: async () => { events.push("abandon"); }
  };
  const blob: any = {
    put: async (path: string) => { events.push(`put:${path}`); return { pathname: path, url: `https://test.invalid/${path}`, contentType: "image/png" }; },
    copy: async (_source: string, path: string) => { events.push(`copy:${path}`); return { pathname: path, url: `https://test.invalid/${path}`, contentType: "image/png" }; }
  };
  const req: any = new EventEmitter();
  const res: any = new EventEmitter();
  res.statusCode = 200;
  res.locals = { validatedImages: [{ path: "never-read-by-fake", fieldName: "cover", size: 67, contentType: "image/png", extension: "png" }] };
  const context = { workId: "work", workSlug: "sample-1111", actorId: "actor" };
  const plan = async () => ({ context, objects: objects ?? [{ pathname: "sample-1111/Covers/abcd.png", contentType: "image/png", size: 67, fileIndex: 0, fieldName: "cover" }] });
  const execute = () => uploadMedia({ repository, plan, blob })(req, res, () => events.push("next"));
  return { events, repository, blob, req, res, execute };
}

test("metadata-only upload plan never opens a journal or invokes Blob", async () => {
  const { execute, res, events } = await setup([]);
  res.locals.validatedImages = [];
  await execute();
  assert.deepEqual(events, ["next"]);
  assert.deepEqual(res.locals.uploadedMedia, []);
});

test("journal reserves all destinations before first effect and exposes typed server metadata", async () => {
  const { execute, events, res } = await setup([
    { pathname: "sample-1111/Chapter-2222/abcd-1.png", contentType: "image/png", size: 67, fileIndex: 0, position: 1 },
    { pathname: "sample-1111/Chapter-2222/abcd-2.png", contentType: "image/png", size: 67, sourcePathname: "sample-1111/Chapter-2222/eeee-1.png", position: 2 }
  ]);
  await execute();
  assert.deepEqual(events.map(e => e.split(":")[0]), ["begin", "plan", "plan", "put", "uploaded", "copy", "uploaded", "next"]);
  assert.equal(res.locals.uploadContext.batchId, "batch");
  assert.deepEqual(res.locals.uploadedMedia.map((a: any) => a.position), [1, 2]);
  assert.match(res.locals.uploadedMedia[0].id, /^[a-f\d-]{36}$/);
});

test("partial Blob failure abandons entire batch and does not expose a partial asset list", async () => {
  const { execute, events, res, blob } = await setup([
    { pathname: "sample-1111/Chapter-2222/abcd-1.png", contentType: "image/png", size: 67, fileIndex: 0, position: 1 },
    { pathname: "sample-1111/Chapter-2222/abcd-2.png", contentType: "image/png", size: 67, sourcePathname: "sample-1111/Chapter-2222/eeee-1.png", position: 2 }
  ]);
  blob.copy = async () => { throw new Error("provider-token-must-never-be-returned"); };
  await assert.rejects(execute(), { statusCode: 500, message: "Unable to upload image files" });
  assert.ok(events.some(e => e.startsWith("uploaded:")));
  assert.equal(events.at(-1), "abandon");
  assert.ok(!events.includes("next"));
  assert.deepEqual(res.locals.uploadedMedia, []);
});

test("pathname collision reservation failure happens before any Blob write", async () => {
  const { execute, repository, events } = await setup();
  const { default: AppError } = await import("../src/utils/AppError");
  repository.planObject = async () => { throw new AppError("collision", 409); };
  await assert.rejects(execute(), { statusCode: 409 });
  assert.deepEqual(events, ["begin", "abandon"]);
});

test("failed response after upload schedules durable abandonment", async () => {
  const { execute, events, res } = await setup();
  await execute();
  res.statusCode = 409;
  res.emit("finish");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.at(-1), "abandon");
});

test("content inspection accepts real PNG and rejects MIME lies, SVG, empty, truncation and corrupt checksum", async () => {
  const { inspectImage } = await import("../src/middlewares/media/image-validation");
  assert.deepEqual(inspectImage(png, "image/png"), { contentType: "image/png", extension: "png" });
  const corrupt = Buffer.from(png); corrupt[30] ^= 1;
  for (const [data, mime] of [[png, "image/jpeg"], [Buffer.from("<svg/>"), "image/png"], [Buffer.alloc(0), "image/png"], [png.subarray(0, 12), "image/png"], [corrupt, "image/png"]] as const) {
    assert.throws(() => inspectImage(data, mime), { statusCode: 400 });
  }
});
