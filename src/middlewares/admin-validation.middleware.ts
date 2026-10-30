import type { RequestHandler } from "express";
import type Joi from "joi";
import { ErrorResponseHandler } from "../handlers/error.handler";
import AppError from "../utils/AppError";

/** New administrative routes opt in; existing validation middleware keeps its behavior. */
export function validateAdminInput(source: "params" | "query" | "body", schema: Joi.ObjectSchema): RequestHandler {
	return (req, res, next) => {
		// Empty revocation requests have no parsed body; validate them as an empty object.
		const input = source === "body" && req.body === undefined ? {} : req[source];
		const { error, value } = schema.unknown(false).required().validate(input, {
			abortEarly: false, convert: true, allowUnknown: false, stripUnknown: false
		});
		if (error) {
			// Do not echo reasons, evidence, supplied values or privileged field names.
			ErrorResponseHandler(res, new AppError(`Validation error: invalid ${source}`, 400));
			return;
		}
		// Express 5 exposes req.query via a getter; assignment alone does not work.
		Object.defineProperty(req, source, { value, writable: true, configurable: true, enumerable: true });
		next();
	};
}
