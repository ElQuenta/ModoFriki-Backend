import { describe, expect, it } from "vitest";
import type Joi from "joi";
import { latestChaptersQuerySchema, popularWorksQuerySchema, recommendedWorksQuerySchema, validateDiscovery } from "../discovery.schema";

const ok = (schema: Joi.Schema, input: unknown) => {
	const { error, value } = schema.validate(input, { abortEarly: false, convert: true });
	expect(error).toBeUndefined();
	return value;
};
const bad = (schema: Joi.Schema, input: unknown) => expect(schema.validate(input, { convert: true }).error).toBeDefined();

const uuid = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";

describe("latestChaptersQuerySchema", () => {
	it("applies defaults to an empty query", () => expect(ok(latestChaptersQuerySchema, {})).toEqual({ page: 1, limit: 12 }));
	it("undefined input yields the literal default {}", () => expect(ok(latestChaptersQuerySchema, undefined)).toEqual({}));
	it("converts and lowercases", () => {
		expect(ok(latestChaptersQuerySchema, { page: "2", limit: "50", typeId: uuid.toUpperCase() })).toEqual({ page: 2, limit: 50, typeId: uuid });
	});
	it.each([
		[{ page: "0" }], [{ limit: "51" }], [{ limit: "1.5" }], [{ typeId: "x" }],
		[{ typeId: `{${uuid}}` }], [{ typeId: uuid.replace(/-/g, ":") }], [{ period: "day" }]
	])("rejects %o", input => bad(latestChaptersQuerySchema, input));
});

describe("popularWorksQuerySchema", () => {
	it("applies defaults", () => expect(ok(popularWorksQuerySchema, {})).toEqual({ period: "all", page: 1, limit: 12 }));
	it("accepts period day", () => expect(ok(popularWorksQuerySchema, { period: "day", page: "3" })).toMatchObject({ period: "day", page: 3 }));
	it.each([[{ period: "week" }], [{ limit: "0" }], [{ sort: "x" }]])("rejects %o", input => bad(popularWorksQuerySchema, input));
});

describe("recommendedWorksQuerySchema", () => {
	it("applies default limit", () => expect(ok(recommendedWorksQuerySchema, {})).toEqual({ limit: 12 }));
	it("converts limit", () => expect(ok(recommendedWorksQuerySchema, { limit: "5" })).toEqual({ limit: 5 }));
	it.each([[{ limit: "51" }], [{ page: "1" }], [{ typeId: uuid }]])("rejects %o", input => bad(recommendedWorksQuerySchema, input));
});

describe("validateDiscovery", () => {
	it("returns converted value", () => expect(validateDiscovery(popularWorksQuerySchema, { limit: "4" })).toEqual({ period: "all", page: 1, limit: 4 }));
	it("throws AppError 400 with Validation error message", () => {
		expect(() => validateDiscovery(popularWorksQuerySchema, { period: "week" }))
			.toThrow(expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/^Validation error: .*period/) }));
	});
});
