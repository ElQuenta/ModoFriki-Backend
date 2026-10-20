import "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";

const actor = { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" as const };
const workId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";

function transactionClient(overrides: Record<string, unknown> = {}) {
  const tx: any = {
    $queryRaw: async () => [],
    user: { findUnique: async () => ({ ...actor, status: "ACTIVE", deletedAt: null }) },
    uploadBatch: { findFirst: async () => null },
    work: { findUnique: async () => ({ id: workId, publicationStatus: "PUBLISHED", deletedAt: null }) },
    ...overrides
  };
  return { tx, client: { $transaction: async (run: (client: any) => unknown) => run(tx) } as any };
}

test("failed chapter creation reuses its hidden reservation; real deleted chapters stay unavailable", async () => {
  const { ChapterRepository } = await import("../src/repositories/catalog/chapter.repository");
  for (const version of [1, 2]) {
    const previous = { id: chapterId, deletedAt: new Date(), version, status: "DRAFT", createdById: actor.id, _count: { pages: 0 } };
    let reused = false;
    const { client } = transactionClient({ chapter: {
      findUnique: async () => previous,
      update: async ({ where }: any) => { reused = true; assert.equal(where.id, chapterId); return previous; }
    } });
    const operation = new ChapterRepository(client).reserve("44444444-4444-4444-8444-444444444444", workId, { number: "1" }, actor);
    if (version === 1) assert.equal((await operation).id, chapterId);
    else await assert.rejects(operation, { statusCode: 409 });
    assert.equal(reused, version === 1);
  }
});

test("persistence rejects stale work updates before linking uploaded assets", async () => {
  const { WorkRepository } = await import("../src/repositories/catalog/work.repository");
  const { client } = transactionClient({ work: { findUnique: async () => ({ deletedAt: null, updatedAt: new Date("2026-01-02T00:00:00Z") }) } });
  await assert.rejects(new WorkRepository(client).save({ actor, workId, data: { title: "Changed" }, expectedUpdatedAt: new Date("2026-01-01T00:00:00Z"), batchId: "unlinked-batch" }), { statusCode: 409 });
});

test("chapter publication rechecks the parent status inside persistence", async () => {
  const { ChapterRepository } = await import("../src/repositories/catalog/chapter.repository");
  const { client } = transactionClient({
    work: { findUnique: async () => ({ id: workId, publicationStatus: "DRAFT" }) },
    chapter: { findUnique: async () => ({ id: chapterId, version: 1, status: "DRAFT", deletedAt: null, pages: [{ position: 1 }] }) }
  });
  await assert.rejects(new ChapterRepository(client).save({ actor, workId, chapterId, data: { status: "PUBLISHED" }, expectedVersion: 1 }), { statusCode: 400 });
});

test("expired upload batches cannot reserve additional destinations", async () => {
  const { MediaRepository } = await import("../src/repositories/catalog/media.repository");
  let planned = false;
  const { client } = transactionClient({
    uploadBatch: { findUnique: async () => ({ id: "batch", workId, status: "PENDING", expiresAt: new Date(0) }) },
    uploadObject: { create: async () => { planned = true; return { id: "object" }; } }
  });
  await assert.rejects(new MediaRepository(client).planObject("batch", "sample-1111/Covers/aaaa.png"), { statusCode: 409 });
  assert.equal(planned, false);
});

test("cleanup claims never return a file that still has a database reference", async () => {
  const { MediaRepository } = await import("../src/repositories/catalog/media.repository");
  const updates: any[] = [];
  const { client } = transactionClient({
    mediaCleanupJob: {
      findMany: async () => [{ id: "job", pathname: "sample-1111/Covers/aaaa.png", status: "PENDING", updatedAt: new Date(), attempts: 0 }],
      updateMany: async () => ({ count: 1 }),
      update: async (input: any) => { updates.push(input); }
    },
    mediaAsset: { findUnique: async () => ({ id: "asset", _count: { workCovers: 1, incapBanners: 0, pages: 0, siteSettings: 0 } }) }
  });
  assert.deepEqual(await new MediaRepository(client).claimCleanup(), []);
  assert.equal(updates[0].data.lastErrorCode, "STILL_REFERENCED");
});

test("cleanup worker retries provider failures and continues processing remaining jobs", async () => {
  const { runMediaCleanup } = await import("../src/services/media/cleanup.service");
  const events: string[] = [];
  await runMediaCleanup({
    reconcileExpiredBatches: async () => { events.push("reconcile"); return 1; },
    claimCleanup: async () => [{ id: "bad", pathname: "bad", assetId: null, attempts: 1 }, { id: "good", pathname: "good", assetId: null, attempts: 1 }],
    completeCleanup: async (id) => { events.push(`complete:${id}`); },
    failCleanup: async (id, code) => { events.push(`retry:${id}:${code}`); }
  }, async (path) => { if (path === "bad") throw new Error("provider-secret"); events.push(`delete:${path}`); });
  assert.deepEqual(events, ["reconcile", "retry:bad:BLOB_DELETE_FAILED", "delete:good", "complete:good"]);
});
