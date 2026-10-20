import Joi from "joi";

export const registerBodySchema = Joi.object({
	username: Joi.string().trim().min(3).max(32).required(),
	email: Joi.string().trim().email({ tlds: { allow: false } }).max(254).required(),
	password: Joi.string().min(8).max(72, "utf8").required(),
	timezone: Joi.string().max(100).pattern(/^(?![+-])\S+$/)
}).unknown(false).required();

export const loginBodySchema = Joi.object({
	email: Joi.string().trim().email({ tlds: { allow: false } }).max(254).required(),
	password: Joi.string().min(8).max(72, "utf8").required()
}).unknown(false).required();
