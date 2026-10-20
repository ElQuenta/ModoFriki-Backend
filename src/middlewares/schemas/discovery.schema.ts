import Joi from "joi";
import AppError from "../../utils/AppError";

const pageQueryKeys = {
	page: Joi.number().integer().min(1).max(100000).default(1),
	limit: Joi.number().integer().min(1).max(50).default(12),
	// Strict v4 (Prisma uuid()): wrapper false and separator "-" so Postgres ::uuid never sees "[...]" or ":".
	typeId: Joi.string().guid({ version: "uuidv4", separator: "-", wrapper: false }).lowercase()
};

export const latestChaptersQuerySchema = Joi.object(pageQueryKeys).unknown(false).default({});

export const popularWorksQuerySchema = Joi.object({
	period: Joi.string().valid("all", "day").default("all"),
	...pageQueryKeys
}).unknown(false).default({});

export function validateDiscovery<T>(schema: Joi.Schema, input: unknown): T {
	const result = schema.validate(input, { abortEarly: false, convert: true });
	if (result.error) throw new AppError(`Validation error: ${result.error.details.map(detail => detail.message).join(", ")}`, 400);
	return result.value as T;
}
