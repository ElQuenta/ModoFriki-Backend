import Joi from "joi";

const uuid = Joi.string().guid({ version: "uuidv4" }).lowercase().required();
const canonicalInstant = Joi.string()
	.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
	.custom((value: string, helpers) => {
		const parsed = new Date(value);
		return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
			? value
			: helpers.error("date.format");
	})
	.required();

const cursor = {
	cursorCreatedAt: canonicalInstant.optional(),
	cursorId: uuid.optional()
};

export const adminUserParamsSchema = Joi.object({ userId: uuid }).unknown(false).required();
export const adminAssignmentParamsSchema = Joi.object({ userId: uuid, workId: uuid }).unknown(false).required();

export const adminUsersQuerySchema = Joi.object({
	limit: Joi.number().integer().min(1).max(100).default(20),
	role: Joi.string().valid("BASIC", "EDITOR", "ADMIN"),
	status: Joi.string().valid("ACTIVE", "SUSPENDED"),
	...cursor
}).and("cursorCreatedAt", "cursorId").unknown(false).default({});

export const adminAssignmentsQuerySchema = Joi.object({
	limit: Joi.number().integer().min(1).max(100).default(20),
	includeRevoked: Joi.boolean().truthy("true").falsy("false").default(false),
	...cursor
}).and("cursorCreatedAt", "cursorId").unknown(false).default({});

export const adminRoleBodySchema = Joi.object({
	role: Joi.string().valid("BASIC", "EDITOR").required(),
	expectedUpdatedAt: canonicalInstant
}).unknown(false).required();

export const adminAssignBodySchema = Joi.object({
	expectedVersion: Joi.number().integer().min(0).strict().required()
}).unknown(false).required();

export const adminRevokeBodySchema = Joi.object({
	expectedVersion: Joi.number().integer().min(1).strict().required()
}).unknown(false).required();
