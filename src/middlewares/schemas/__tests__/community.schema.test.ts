import { describe, expect, it } from "vitest";
import type Joi from "joi";
import { createCommentBodySchema, createReportBodySchema, editCommentBodySchema, resolveReportBodySchema, voteBodySchema } from "../community.schema";

const ok = (schema: Joi.Schema, input: unknown) => {
	const { error, value } = schema.validate(input, { abortEarly: false, convert: true });
	expect(error).toBeUndefined();
	return value;
};
const bad = (schema: Joi.Schema, input: unknown) => expect(schema.validate(input, { convert: true }).error).toBeDefined();

const uuid = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";

describe("createCommentBodySchema", () => {
	it("accepts a root comment on a target and lowercases the id", () => {
		expect(ok(createCommentBodySchema, { targetType: "WORK", targetId: uuid.toUpperCase(), bodyMarkdown: "Hola" }))
			.toEqual({ targetType: "WORK", targetId: uuid, bodyMarkdown: "Hola" });
	});
	it("accepts a reply", () => {
		expect(ok(createCommentBodySchema, { parentCommentId: uuid, bodyMarkdown: "re" })).toEqual({ parentCommentId: uuid, bodyMarkdown: "re" });
	});
	it.each([
		["missing body", { targetType: "WORK", targetId: uuid }],
		["blank body", { targetType: "WORK", targetId: uuid, bodyMarkdown: "   " }],
		["body over 10000", { targetType: "WORK", targetId: uuid, bodyMarkdown: "a".repeat(10001) }],
		["neither target nor parent", { bodyMarkdown: "x" }],
		["both target and parent", { targetType: "WORK", targetId: uuid, parentCommentId: uuid, bodyMarkdown: "x" }],
		["targetId without targetType", { targetId: uuid, bodyMarkdown: "x" }],
		["bad targetType", { targetType: "USER", targetId: uuid, bodyMarkdown: "x" }],
		["bad uuid", { targetType: "WORK", targetId: "123", bodyMarkdown: "x" }],
		["unknown key", { targetType: "WORK", targetId: uuid, bodyMarkdown: "x", authorId: uuid }]
	])("rejects %s", (_name, input) => bad(createCommentBodySchema, input));
});

describe("editCommentBodySchema", () => {
	it("accepts a valid edit", () => expect(ok(editCommentBodySchema, { bodyMarkdown: "new", expectedRevision: 0 })).toEqual({ bodyMarkdown: "new", expectedRevision: 0 }));
	it.each([
		["string revision (strict)", { bodyMarkdown: "x", expectedRevision: "1" }],
		["negative revision", { bodyMarkdown: "x", expectedRevision: -1 }],
		["decimal revision", { bodyMarkdown: "x", expectedRevision: 1.5 }],
		["missing revision", { bodyMarkdown: "x" }],
		["missing body", { expectedRevision: 1 }],
		["unknown key", { bodyMarkdown: "x", expectedRevision: 1, status: "DELETED" }]
	])("rejects %s", (_name, input) => bad(editCommentBodySchema, input));
});

describe("voteBodySchema", () => {
	it.each([1, -1])("accepts %d", value => expect(ok(voteBodySchema, { value })).toEqual({ value }));
	it.each([[0], [2], ["1"], [undefined]])("rejects %s", value => bad(voteBodySchema, { value }));
	it("rejects unknown key", () => bad(voteBodySchema, { value: 1, extra: 1 }));
});

describe("createReportBodySchema", () => {
	it("accepts a valid report", () => expect(ok(createReportBodySchema, { reason: "SPAM", details: "ads" })).toEqual({ reason: "SPAM", details: "ads" }));
	it.each([
		["missing reason", { details: "x" }],
		["bad reason", { reason: "BORING" }],
		["blank details", { reason: "SPAM", details: "  " }],
		["details over 2000", { reason: "SPAM", details: "a".repeat(2001) }],
		["unknown key", { reason: "SPAM", status: "OPEN" }]
	])("rejects %s", (_name, input) => bad(createReportBodySchema, input));
});

describe("resolveReportBodySchema", () => {
	it("accepts a valid resolution", () => expect(ok(resolveReportBodySchema, { status: "DISMISSED", resolution: "ok" })).toEqual({ status: "DISMISSED", resolution: "ok" }));
	it.each([
		["status OPEN", { status: "OPEN", resolution: "x" }],
		["missing resolution", { status: "RESOLVED" }],
		["missing status", { resolution: "x" }],
		["unknown key", { status: "RESOLVED", resolution: "x", reason: "SPAM" }]
	])("rejects %s", (_name, input) => bad(resolveReportBodySchema, input));
});
