import { describe, expect, it } from "vitest";
import type Joi from "joi";
import { readingCalendarSchema, readingEventSchema, readingPageSchema, readingRatingSchema, readingUuid, validateReading } from "../reading.schema";

const ok = (schema: Joi.Schema, input: unknown) => {
	const { error, value } = schema.validate(input, { abortEarly: false, convert: true });
	expect(error).toBeUndefined();
	return value;
};
const bad = (schema: Joi.Schema, input: unknown) => expect(schema.validate(input, { convert: true }).error).toBeDefined();

const uuid = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";

describe("readingUuid", () => {
	it("accepts and lowercases v4", () => expect(ok(readingUuid, uuid.toUpperCase())).toBe(uuid));
	it("rejects missing or invalid", () => {
		bad(readingUuid, undefined);
		bad(readingUuid, "abc");
	});
});

describe("readingEventSchema", () => {
	it("accepts a valid key", () => expect(ok(readingEventSchema, { idempotencyKey: uuid })).toEqual({ idempotencyKey: uuid }));
	it("rejects missing/invalid key and unknown keys", () => {
		bad(readingEventSchema, {});
		bad(readingEventSchema, { idempotencyKey: "x" });
		bad(readingEventSchema, { idempotencyKey: uuid, page: 1 });
		bad(readingEventSchema, undefined);
	});
});

describe("readingRatingSchema", () => {
	it.each([0, 2.5, 5])("accepts %d", score => expect(ok(readingRatingSchema, { score })).toEqual({ score }));
	it.each([[-0.5], [5.5], [2.3], ["4"], [undefined]])("rejects %s", score => bad(readingRatingSchema, { score }));
	it("rejects unknown key", () => bad(readingRatingSchema, { score: 1, extra: 1 }));
});

describe("readingPageSchema", () => {
	it("applies defaults to an empty query", () => expect(ok(readingPageSchema, {})).toEqual({ page: 1, limit: 20 }));
	it("undefined input yields the literal default {}", () => expect(ok(readingPageSchema, undefined)).toEqual({}));
	it("converts strings", () => expect(ok(readingPageSchema, { page: "2", limit: "100" })).toEqual({ page: 2, limit: 100 }));
	it.each([[{ page: "0" }], [{ limit: "101" }], [{ page: "x" }], [{ sort: "asc" }]])("rejects %o", input => bad(readingPageSchema, input));
});

describe("readingCalendarSchema", () => {
	it("defaults to empty object", () => expect(ok(readingCalendarSchema, undefined)).toEqual({}));
	it("accepts real dates", () => expect(ok(readingCalendarSchema, { from: "2024-02-29", to: "2026-10-20" })).toEqual({ from: "2024-02-29", to: "2026-10-20" }));
	it.each([[{ from: "2025-02-29" }], [{ to: "2026-13-01" }], [{ from: "2026-1-1" }], [{ from: "20-10-2026" }], [{ day: "2026-10-20" }]])("rejects %o", input => bad(readingCalendarSchema, input));
});

describe("validateReading", () => {
	it("returns converted value", () => expect(validateReading(readingPageSchema, { page: "3" })).toEqual({ page: 3, limit: 20 }));
	it("throws AppError 400", () => expect(() => validateReading(readingRatingSchema, { score: 9 })).toThrow(expect.objectContaining({ statusCode: 400, message: "Invalid reading input" })));
});
