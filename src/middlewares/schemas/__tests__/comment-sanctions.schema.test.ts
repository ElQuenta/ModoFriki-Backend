import type Joi from "joi";
import { beforeAll, describe, expect, it } from "vitest";

const userId = "22222222-2222-4222-8222-222222222222";
const sanctionId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";

type Schemas = {
	imposeCommentSanctionBodySchema: Joi.ObjectSchema;
	commentSanctionUserParamsSchema: Joi.ObjectSchema;
	commentSanctionParamsSchema: Joi.ObjectSchema;
	commentSanctionHistoryQuerySchema: Joi.ObjectSchema;
	revokeCommentSanctionBodySchema: Joi.ObjectSchema;
};

describe("comment sanction Joi contracts", () => {
	let schemas: Schemas;
	beforeAll(async () => {
		const modulePath = "../comment-sanctions.schema.js";
		schemas = await import(modulePath) as Schemas;
	});
	const valid = (schema: Joi.ObjectSchema, value: unknown) => schema.validate(value, { abortEarly: false, convert: true });

	it("trims a bounded reason and accepts permanent or future ISO endsAt", () => {
		const permanent = valid(schemas.imposeCommentSanctionBodySchema, { reason: "  spam repetido  ", endsAt: null });
		expect(permanent.error).toBeUndefined();
		expect(permanent.value).toEqual({ reason: "spam repetido", endsAt: null });
		const temporary = valid(schemas.imposeCommentSanctionBodySchema, { reason: "spam", endsAt: "2099-01-01T00:00:00.000Z" });
		expect(temporary.error).toBeUndefined();
		expect(temporary.value.endsAt).toBeInstanceOf(Date);
	});

	it.each([
		{ reason: "", endsAt: null }, { reason: "   ", endsAt: null },
		{ reason: "x".repeat(2001), endsAt: null }, { reason: "ok" },
		{ reason: "ok", endsAt: "tomorrow" }, { reason: "ok", endsAt: null, startsAt: new Date() },
		{ reason: "ok", endsAt: null, imposedById: userId }, { reason: "ok", endsAt: null, closedAt: null }
	])("rejects invalid or server-owned sanction input %#", input => {
		expect(valid(schemas.imposeCommentSanctionBodySchema, input).error).toBeDefined();
	});

	it("accepts only a complete COMMENT or REPORT evidence pair", () => {
		for (const type of ["COMMENT", "REPORT"] as const) {
			const result = valid(schemas.imposeCommentSanctionBodySchema, { reason: "evidence", endsAt: null, evidence: { type, id: evidenceId } });
			expect(result.error).toBeUndefined();
		}
		for (const evidence of [{ type: "COMMENT" }, { id: evidenceId }, { type: "WORK", id: evidenceId }, { type: "REPORT", id: "bad" }]) {
			expect(valid(schemas.imposeCommentSanctionBodySchema, { reason: "evidence", endsAt: null, evidence }).error).toBeDefined();
		}
	});

	it("validates UUID params, strict empty revocation body and paired cursor", () => {
		expect(valid(schemas.commentSanctionUserParamsSchema, { userId }).error).toBeUndefined();
		expect(valid(schemas.commentSanctionParamsSchema, { userId, sanctionId }).error).toBeUndefined();
		expect(valid(schemas.revokeCommentSanctionBodySchema, {}).error).toBeUndefined();
		expect(valid(schemas.revokeCommentSanctionBodySchema, { reason: "no" }).error).toBeDefined();
		expect(valid(schemas.commentSanctionHistoryQuerySchema, { limit: "20" }).error).toBeUndefined();
		expect(valid(schemas.commentSanctionHistoryQuerySchema, { cursorId: sanctionId }).error).toBeDefined();
		expect(valid(schemas.commentSanctionHistoryQuerySchema, { cursorCreatedAt: "2026-10-30T12:00:00.000Z" }).error).toBeDefined();
		expect(valid(schemas.commentSanctionHistoryQuerySchema, { cursorCreatedAt: "2026-10-30T12:00:00.000Z", cursorId: sanctionId }).error).toBeUndefined();
	});
});
