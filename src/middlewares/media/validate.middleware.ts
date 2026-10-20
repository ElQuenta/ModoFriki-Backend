import { readFile } from "node:fs/promises";
import type { RequestHandler } from "express";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { inspectImage } from "./image-validation";
import type { ReceivedImage, ValidatedImage } from "./types";

const logger = createLogger("ImageValidation");
export const validateImages = (): RequestHandler => async (_req, res, next) => {
	try {
		const files: ReceivedImage[] = res.locals.receivedImages ?? [];
		const validated: ValidatedImage[] = [];
		// Read one bounded file at a time; buffers are never stored in res.locals or persisted.
		for (const [index, file] of files.entries()) {
			const format = inspectImage(await readFile(file.path), file.mimetype);
			validated.push({ fieldName: file.fieldname, index, path: file.path, size: file.size, ...format });
		}
		res.locals.validatedImages = validated;
		next();
	} catch (error) { return catchAndLogError(logger, error, "Unable to validate image files"); }
};
