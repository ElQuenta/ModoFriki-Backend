import { describe, expect, it } from "vitest";
import type Joi from "joi";
import {
	catalogListSchema, catalogUuid, createChapterSchema, createWorkSchema, deleteChapterSchema, deleteWorkSchema,
	editChapterSchema, editWorkSchema, insertPagesSchema, reorderPagesSchema, taxonomySchema, validateCatalog
} from "../catalog.schema";

const ok = (schema: Joi.Schema, input: unknown) => {
	const { error, value } = schema.validate(input, { abortEarly: false, convert: true });
	expect(error).toBeUndefined();
	return value;
};
const bad = (schema: Joi.Schema, input: unknown) => expect(schema.validate(input, { convert: true }).error).toBeDefined();

const uuid = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const now = "2026-10-20T12:00:00.000Z";

describe("catalogUuid", () => {
	it("accepts v4 and lowercases it", () => expect(ok(catalogUuid, uuid.toUpperCase())).toBe(uuid));
	it("rejects non-v4 and garbage", () => {
		bad(catalogUuid, "3f2b8c1e-4a5d-1e6f-9a7b-1c2d3e4f5a6b");
		bad(catalogUuid, "not-a-uuid");
	});
});

describe("createWorkSchema", () => {
	const work = { title: "Solo", synopsis: "Story", typeId: uuid };
	it("accepts a valid work", () => {
		expect(ok(createWorkSchema, { ...work, title: " Solo ", genreIds: [uuid], alternativeTitles: ["A"], publicationStatus: "DRAFT", releaseStatus: "ONGOING" }))
			.toMatchObject({ ...work, genreIds: [uuid] });
	});
	it.each([
		["missing title", { synopsis: "s", typeId: uuid }],
		["missing typeId", { title: "t", synopsis: "s" }],
		["empty title", { ...work, title: "  " }],
		["long title", { ...work, title: "a".repeat(201) }],
		["bad typeId", { ...work, typeId: "123" }],
		["bad publicationStatus", { ...work, publicationStatus: "ARCHIVED" }],
		["bad releaseStatus", { ...work, releaseStatus: "DONE" }],
		["duplicate genreIds", { ...work, genreIds: [uuid, uuid] }],
		["unknown key", { ...work, slug: "x" }],
		["undefined", undefined]
	])("rejects %s", (_name, input) => bad(createWorkSchema, input));
});

describe("editWorkSchema / deleteWorkSchema", () => {
	it("accepts partial edit with expectedUpdatedAt converted to Date", () => {
		expect(ok(editWorkSchema, { title: "New", expectedUpdatedAt: now }).expectedUpdatedAt).toBeInstanceOf(Date);
		expect(ok(deleteWorkSchema, { expectedUpdatedAt: now }).expectedUpdatedAt).toBeInstanceOf(Date);
	});
	it("rejects missing or invalid expectedUpdatedAt and unknown keys", () => {
		bad(editWorkSchema, { title: "New" });
		bad(editWorkSchema, { expectedUpdatedAt: "yesterday" });
		bad(deleteWorkSchema, {});
		bad(deleteWorkSchema, { expectedUpdatedAt: now, title: "x" });
	});
});

describe("createChapterSchema", () => {
	it.each([["string decimal", "12.5"], ["integer number", 12], ["decimal number", 1.25]])("accepts number as %s", (_name, number) => {
		expect(ok(createChapterSchema, { number, title: null, kind: "EXTRA", status: "PUBLISHED" }).number).toBe(number);
	});
	it.each([
		["missing number", { title: "t" }],
		["negative number", { number: -1 }],
		["too many decimals (string)", { number: "1.2345" }],
		["too many decimals (number)", { number: 1.2345 }],
		["text number", { number: "abc" }],
		["bad kind", { number: 1, kind: "SPECIAL" }],
		["bad status", { number: 1, status: "LIVE" }],
		["unknown key", { number: 1, workId: uuid }]
	])("rejects %s", (_name, input) => bad(createChapterSchema, input));
});

describe("editChapterSchema / deleteChapterSchema", () => {
	it("accepts and converts expectedVersion", () => {
		expect(ok(editChapterSchema, { title: "t", expectedVersion: "3" }).expectedVersion).toBe(3);
		expect(ok(deleteChapterSchema, { expectedVersion: 1 })).toEqual({ expectedVersion: 1 });
	});
	it("rejects bad expectedVersion", () => {
		bad(editChapterSchema, { title: "t" });
		bad(deleteChapterSchema, { expectedVersion: 0 });
		bad(deleteChapterSchema, { expectedVersion: 1.5 });
		bad(deleteChapterSchema, { expectedVersion: 2147483647 });
		bad(deleteChapterSchema, { expectedVersion: 1, extra: true });
	});
});

describe("insertPagesSchema", () => {
	it("accepts and converts", () => expect(ok(insertPagesSchema, { expectedVersion: "1", position: "2" })).toEqual({ expectedVersion: 1, position: 2 }));
	it("rejects missing or invalid position", () => {
		bad(insertPagesSchema, { expectedVersion: 1 });
		bad(insertPagesSchema, { expectedVersion: 1, position: 0 });
	});
});

describe("reorderPagesSchema", () => {
	it("accepts a list of page ids", () => expect(ok(reorderPagesSchema, { expectedVersion: 1, pageIds: [uuid] }).pageIds).toEqual([uuid]));
	it("rejects empty, duplicated or invalid ids", () => {
		bad(reorderPagesSchema, { expectedVersion: 1, pageIds: [] });
		bad(reorderPagesSchema, { expectedVersion: 1, pageIds: [uuid, uuid] });
		bad(reorderPagesSchema, { expectedVersion: 1, pageIds: ["x"] });
		bad(reorderPagesSchema, { expectedVersion: 1 });
	});
});

describe("taxonomySchema", () => {
	it("accepts a valid taxonomy", () => expect(ok(taxonomySchema, { name: " Acción ", slug: "accion-y-aventura" })).toEqual({ name: "Acción", slug: "accion-y-aventura" }));
	it.each([
		["missing name", { slug: "a" }],
		["missing slug", { name: "a" }],
		["uppercase slug", { name: "a", slug: "Accion" }],
		["trailing dash slug", { name: "a", slug: "accion-" }],
		["unknown key", { name: "a", slug: "a", id: uuid }]
	])("rejects %s", (_name, input) => bad(taxonomySchema, input));
});

describe("catalogListSchema", () => {
	it("applies defaults", () => expect(ok(catalogListSchema, {})).toEqual({ page: 1, limit: 20, includeDrafts: false }));
	it("converts query strings", () => {
		expect(ok(catalogListSchema, { page: "2", limit: "50", includeDrafts: "true", genreId: uuid, search: " solo " }))
			.toEqual({ page: 2, limit: 50, includeDrafts: true, genreId: uuid, search: "solo" });
	});
	it.each([
		["page 0", { page: "0" }],
		["limit over 100", { limit: "101" }],
		["non-integer page", { page: "1.5" }],
		["bad typeId", { typeId: "x" }],
		["bad boolean", { includeDrafts: "maybe" }],
		["unknown key", { sort: "asc" }]
	])("rejects %s", (_name, input) => bad(catalogListSchema, input));
});

describe("validateCatalog", () => {
	it("returns converted value", () => expect(validateCatalog(catalogListSchema, { page: "3" })).toMatchObject({ page: 3 }));
	it("throws AppError 400", () => expect(() => validateCatalog(catalogListSchema, { page: "x" })).toThrow(expect.objectContaining({ statusCode: 400, message: "Invalid catalog input" })));
});
