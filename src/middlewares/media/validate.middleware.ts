import { readFile } from "node:fs/promises";
import sharp from "sharp";
import AppError from "../../utils/AppError";
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
			const data = await readFile(file.path);
			const format = inspectImage(data, file.mimetype);
			// Parse structure first, then decode pixels. Headers alone do not prove a valid bitstream.
			try {
				await sharp(data, { limitInputPixels: 40_000_000, failOn: "warning" })
					.resize(1, 1, { fit: "inside" }).raw().toBuffer();
			} catch { throw new AppError("Invalid or unsupported image content", 400); }
			validated.push({ fieldName: file.fieldname, index, path: file.path, size: file.size, ...format });
		}
		res.locals.validatedImages = validated;
		next();
	} catch (error) { return catchAndLogError(logger, error, "Unable to validate image files"); }
};
