import Joi from "joi";
import AppError from "../../utils/AppError";

export const catalogUuid = Joi.string().guid({ version: "uuidv4" }).lowercase();
const status = Joi.string().valid("DRAFT", "PUBLISHED");
const workFields = {
	title: Joi.string().trim().min(1).max(200), synopsis: Joi.string().trim().min(1).max(30000), typeId: catalogUuid,
	publicationStatus: status, releaseStatus: Joi.string().valid("ONGOING", "COMPLETED", "HIATUS", "CANCELLED"),
	alternativeTitles: Joi.array().items(Joi.string().trim().min(1).max(200)).unique().max(50),
	genreIds: Joi.array().items(catalogUuid).unique().max(50)
};
const chapterFields = {
	number: Joi.alternatives().try(Joi.string().pattern(/^\d{1,9}(?:\.\d{1,3})?$/), Joi.number().min(0).max(999999999.999).precision(3).strict()),
	title: Joi.string().trim().min(1).max(200).allow(null), kind: Joi.string().valid("NORMAL", "EXTRA", "ANNOUNCEMENT"), status
};
export const createWorkSchema = Joi.object(workFields).fork(["title", "synopsis", "typeId"], s => s.required()).unknown(false).required();
export const editWorkSchema = Joi.object({ ...workFields, expectedUpdatedAt: Joi.date().iso().required() }).unknown(false).required();
export const deleteWorkSchema = Joi.object({ expectedUpdatedAt: Joi.date().iso().required() }).unknown(false).required();
export const createChapterSchema = Joi.object(chapterFields).fork("number", s => s.required()).unknown(false).required();
export const editChapterSchema = Joi.object({ ...chapterFields, expectedVersion: Joi.number().integer().min(1).max(2147483646).required() }).unknown(false).required();
export const deleteChapterSchema = Joi.object({ expectedVersion: Joi.number().integer().min(1).max(2147483646).required() }).unknown(false).required();
export const insertPagesSchema = deleteChapterSchema.keys({ position: Joi.number().integer().min(1).required() });
export const reorderPagesSchema = deleteChapterSchema.keys({ pageIds: Joi.array().items(catalogUuid).unique().min(1).max(1000).required() });
export const taxonomySchema = Joi.object({ name: Joi.string().trim().min(1).max(100).required(), slug: Joi.string().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).required() }).unknown(false).required();
export const catalogListSchema = Joi.object({ page: Joi.number().integer().min(1).max(100000).default(1), limit: Joi.number().integer().min(1).max(100).default(20), search: Joi.string().trim().max(200), typeId: catalogUuid, genreId: catalogUuid, includeDrafts: Joi.boolean().default(false) }).unknown(false);

export function validateCatalog<T>(schema: Joi.Schema, input: unknown): T {
	const result = schema.validate(input, { abortEarly: false, convert: true });
	if (result.error) throw new AppError("Invalid catalog input", 400);
	return result.value as T;
}
