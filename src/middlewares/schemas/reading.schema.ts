import Joi from "joi";
import AppError from "../../utils/AppError";

export const readingUuid = Joi.string().guid({ version: "uuidv4" }).lowercase().required();
export const readingEventSchema = Joi.object({ idempotencyKey: readingUuid }).unknown(false).required();
export const readingRatingSchema = Joi.object({ score: Joi.number().min(0).max(5).multiple(0.5).strict().required() }).unknown(false).required();
export const readingPageSchema = Joi.object({
	page: Joi.number().integer().min(1).max(100000).default(1),
	limit: Joi.number().integer().min(1).max(100).default(20)
}).unknown(false).default({});
const calendarDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value: string, helpers) => {
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? value : helpers.error("any.invalid");
});
export const readingCalendarSchema = Joi.object({ from: calendarDate, to: calendarDate }).unknown(false).default({});

export function validateReading<T>(schema: Joi.Schema, input: unknown): T {
	const result = schema.validate(input, { abortEarly: false, convert: true });
	if (result.error) throw new AppError("Invalid reading input", 400);
	return result.value as T;
}
