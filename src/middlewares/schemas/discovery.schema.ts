import Joi from "joi";
import AppError from "../../utils/AppError";

export const latestChaptersQuerySchema = Joi.object({
	page: Joi.number().integer().min(1).max(100000).default(1),
	limit: Joi.number().integer().min(1).max(50).default(12),
	typeId: Joi.string().guid()
}).unknown(false).default({});

export function validateDiscovery<T>(schema: Joi.Schema, input: unknown): T {
	const result = schema.validate(input, { abortEarly: false, convert: true });
	if (result.error) throw new AppError(`Validation error: ${result.error.details.map(detail => detail.message).join(", ")}`, 400);
	return result.value as T;
}
