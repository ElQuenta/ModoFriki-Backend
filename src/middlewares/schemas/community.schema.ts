import Joi from "joi";
import { COMMENT_TARGET_TYPES, REPORT_REASONS, UUID_PATTERN } from "../../models/community/community.types";

const uuidSchema = Joi.string().lowercase().pattern(UUID_PATTERN);
const markdownSchema = Joi.string().max(10000).pattern(/\S/);
const reportTextSchema = Joi.string().max(2000).pattern(/\S/);

export const createCommentBodySchema = Joi.object({
	targetType: Joi.string().valid(...COMMENT_TARGET_TYPES),
	targetId: uuidSchema,
	parentCommentId: uuidSchema,
	bodyMarkdown: markdownSchema.required()
}).unknown(false).required()
	.xor("targetId", "parentCommentId")
	.and("targetType", "targetId");

export const editCommentBodySchema = Joi.object({
	bodyMarkdown: markdownSchema.required(),
	expectedRevision: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER).strict().required()
}).unknown(false).required();

export const voteBodySchema = Joi.object({
	value: Joi.number().valid(-1, 1).strict().required()
}).unknown(false).required();

export const createReportBodySchema = Joi.object({
	reason: Joi.string().valid(...REPORT_REASONS).required(),
	details: reportTextSchema
}).unknown(false).required();

export const resolveReportBodySchema = Joi.object({
	status: Joi.string().valid("RESOLVED", "DISMISSED").required(),
	resolution: reportTextSchema.required()
}).unknown(false).required();
