import type { RequestHandler } from "express";
import type { Schema } from "joi";
import { ErrorResponseHandler } from "../handlers/error.handler";
import AppError from "../utils/AppError";

const validate = (source: "body" | "params" | "query") => (schema: Schema): RequestHandler => (req, res, next) => {
	try {
		const { error, value } = schema.validate(req[source] ?? {}, { abortEarly: false, convert: true });

		if (error) {
			throw new AppError(`Validation error: ${error.details.map((detail) => detail.message).join(", ")}`, 400);
		}

		// Express 5: req.query es un getter del prototipo y no admite asignación directa.
		Object.defineProperty(req, source, { value, writable: true, enumerable: true, configurable: true });
	} catch (error) {
		ErrorResponseHandler(res, error);
		return;
	}

	next();
};

export const validateBody = validate("body");
export const validateParams = validate("params");
export const validateQuery = validate("query");
