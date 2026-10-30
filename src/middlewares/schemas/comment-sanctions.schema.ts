import Joi from "joi";

const uuid = Joi.string().guid({ version: "uuidv4" }).lowercase().required();
const canonicalInstant = Joi.string()
	.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
	.custom((value: string, helpers) => {
		const parsed = new Date(value);
		return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : helpers.error("date.format");
	});

export const commentSanctionUserParamsSchema = Joi.object({ userId: uuid }).unknown(false).required();
export const commentSanctionParamsSchema = Joi.object({ userId: uuid, sanctionId: uuid }).unknown(false).required();

export const commentSanctionsQuerySchema = Joi.object({
	limit: Joi.number().integer().min(1).max(100).default(20),
	cursorCreatedAt: canonicalInstant.optional(),
	cursorId: uuid.optional()
}).and("cursorCreatedAt", "cursorId").unknown(false).default({});

export const imposeCommentSanctionBodySchema = Joi.object({
	reason: Joi.string().trim().min(1).max(2000).required(),
	endsAt: canonicalInstant.allow(null).required(),
	evidence: Joi.object({
		type: Joi.string().valid("COMMENT", "REPORT").required(),
		id: uuid
	}).unknown(false).optional()
}).unknown(false).required();
