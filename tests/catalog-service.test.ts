import "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";

const workId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";
const actor = { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" as const };
const updatedAt = new Date("2026-01-01T00:00:00Z");
const image = { fieldName: "pages", contentType: "image/png", size: 67, extension: "png" };

async function setup() {
  const { CatalogService } = await import("../src/services/catalog/catalog.service");
  const work = { id: workId, slug: "sample-1111", publicationStatus: "PUBLISHED", updatedAt, coverAssetId: "cover", incapBannerAssetId: "banner" };
  const pages = [1, 2, 3].map(position => ({ id: `${position}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, position, asset: { pathname: `sample-1111/Chapter-2222/aaaa-${position}.png`, contentType: "image/png", sizeBytes: 67n } }));
  const chapter = { id: chapterId, version: 5, status: "PUBLISHED", pages };
  const calls: any[] = [];
  const works: any = { findForEdit: async () => work, save: async (input: any) => { calls.push(input); return work; }, abortReservation: async (...args: any[]) => calls.push(["abortWork", ...args]) };
  const chapters: any = { findForEdit: async () => chapter, save: async (input: any) => { calls.push(input); return chapter; }, reserve: async () => chapter, abortReservation: async (...args: any[]) => calls.push(["abortChapter", ...args]) };
  const taxonomy: any = { listTypes: async () => [], listGenres: async () => [] };
  const media: any = { abandonBatch: async (id: string) => calls.push(["abandon", id]) };
  return { service: new CatalogService(works, chapters, taxonomy, media), work, chapter, calls, works, chapters };
}

test("work metadata PUT sends no assets and keeps cover and per-work initial image", async () => {
  const { service, work, calls } = await setup();
  const { plan, prepared } = await service.prepare("editWork", { title: "Renamed", expectedUpdatedAt: updatedAt.toISOString() }, [], actor, workId);
  assert.deepEqual(plan.objects, []);
  assert.equal(plan.context.workSlug, work.slug);
  await service.save(prepared, [], actor);
  assert.equal(calls[0].assets, undefined);
  assert.deepEqual(calls[0].data, { title: "Renamed" });
  assert.equal(work.coverAssetId, "cover");
  assert.equal(work.incapBannerAssetId, "banner");
});

test("chapter metadata PUT sends no pages or upload batch", async () => {
  const { service, calls } = await setup();
  const { plan, prepared } = await service.prepare("editChapter", { title: "Renamed", expectedVersion: 5 }, [], actor, workId, chapterId);
  assert.deepEqual(plan.objects, []);
  await service.save(prepared, [], actor);
  assert.equal(calls[0].pages, undefined);
  assert.equal(calls[0].batchId, undefined);
  assert.equal(calls[0].expectedVersion, 5);
});

test("stale work timestamp and chapter version fail before producing upload plans", async () => {
  const { service } = await setup();
  await assert.rejects(service.prepare("editWork", { title: "stale", expectedUpdatedAt: "2025-01-01T00:00:00Z" }, [], actor, workId), { statusCode: 409 });
  await assert.rejects(service.prepare("editChapter", { expectedVersion: 4 }, [image], actor, workId, chapterId), { statusCode: 409 });
});

test("insertion at beginning, middle and end produces contiguous filenames and preserves all sources", async () => {
  for (const position of [1, 2, 4]) {
    const { service, chapter } = await setup();
    const { plan } = await service.prepare("insert", { expectedVersion: 5, position }, [image], actor, workId, chapterId);
    assert.deepEqual(plan.objects.map(object => object.position), [1, 2, 3, 4]);
    assert.equal(plan.objects[position - 1].fileIndex, 0);
    assert.deepEqual(plan.objects.filter(o => o.sourcePathname).map(o => o.sourcePathname), chapter.pages.map(p => p.asset.pathname));
    plan.objects.forEach((object, index) => assert.match(object.pathname, new RegExp(`/Chapter-2222/[a-f\\d]{4}-${index + 1}\\.png$`)));
  }
});

test("replacement drops previous sources and reorder copies the requested permutation", async () => {
  const { service, chapter } = await setup();
  const replaced = await service.prepare("replace", { expectedVersion: 5 }, [image, image], actor, workId, chapterId);
  assert.deepEqual(replaced.plan.objects.map(o => o.fileIndex), [0, 1]);
  assert.ok(replaced.plan.objects.every(o => !o.sourcePathname));
  const reordered = await service.prepare("reorder", { expectedVersion: 5, pageIds: chapter.pages.map(p => p.id).reverse() }, [], actor, workId, chapterId);
  assert.deepEqual(reordered.plan.objects.map(o => o.sourcePathname), chapter.pages.map(p => p.asset.pathname).reverse());
  assert.equal(reordered.prepared.pagesRequired, true);
});

test("reorder rejects duplicate, missing or foreign pages; insertion bounds are checked", async () => {
  const { service, chapter } = await setup();
  const ids = chapter.pages.map(p => p.id);
  for (const pageIds of [[ids[0], ids[0], ids[2]], ids.slice(1), [ids[0], ids[1], actor.id]]) {
    await assert.rejects(service.prepare("reorder", { expectedVersion: 5, pageIds }, [], actor, workId, chapterId), { statusCode: 400 });
  }
  for (const position of [0, 5]) await assert.rejects(service.prepare("insert", { expectedVersion: 5, position }, [image], actor, workId, chapterId), { statusCode: 400 });
  await assert.rejects(service.prepare("replace", { expectedVersion: 5 }, [], actor, workId, chapterId), { statusCode: 400 });
});

test("staff and current assignment preflight failures propagate before any reservation", async () => {
  const { service, works } = await setup();
  await assert.rejects(service.preflight(workId, undefined, { ...actor, role: "BASIC" }), { statusCode: 403 });
  await assert.rejects(service.preflight(undefined, undefined, { ...actor, role: "EDITOR" }, true), { statusCode: 403 });
  const { default: AppError } = await import("../src/utils/AppError");
  works.findForEdit = async () => { throw new AppError("Assignment revoked", 403); };
  await assert.rejects(service.prepare("editWork", { expectedUpdatedAt: updatedAt.toISOString() }, [], { ...actor, role: "EDITOR" }, workId), { statusCode: 403 });
});

test("publishing requires a cover, a published work, and nonempty chapter pages", async () => {
  const { service, work, chapter } = await setup();
  work.coverAssetId = "";
  await assert.rejects(service.prepare("editWork", { publicationStatus: "PUBLISHED", expectedUpdatedAt: updatedAt.toISOString() }, [], actor, workId), { statusCode: 400 });
  chapter.pages = [];
  await assert.rejects(service.prepare("editChapter", { status: "PUBLISHED", expectedVersion: 5 }, [], actor, workId, chapterId), { statusCode: 400 });
  work.publicationStatus = "DRAFT";
  await assert.rejects(service.prepare("createChapter", { number: "1", status: "PUBLISHED" }, [image], actor, workId), { statusCode: 400 });
});

test("abort abandons batch and hidden creation reservation", async () => {
  const { service, calls } = await setup();
  await service.abort({ actorId: actor.id, workId, chapterId, workSlug: "sample-1111", batchId: "batch", creating: true });
  assert.deepEqual(calls, [["abandon", "batch"], ["abortChapter", chapterId, actor.id]]);
});
