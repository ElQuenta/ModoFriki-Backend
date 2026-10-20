import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, RequestHandler } from "express";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import type { ReceivedImage } from "./types";

// Multer has no installed @types package. Keep its narrow runtime boundary local.
interface MulterFile { fieldname: string; mimetype: string; stream: Readable }
interface StoredFile { destination: string; filename: string; path: string; size: number }
interface MulterFactory {
	(options: { storage: {
		_handleFile(req: Request, file: MulterFile, callback: (error: Error | null, info?: StoredFile) => void): void;
		_removeFile(req: Request, file: StoredFile, callback: (error: Error | null) => void): void;
	}; limits: Record<string, number> }): { fields(fields: { name: string; maxCount: number }[]): RequestHandler };
}
const multer = require("multer") as MulterFactory;
const logger = createLogger("MediaReceive");
export const MEDIA_LIMITS = { fileBytes: 10 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, chapterFiles: 100 } as const;

function receive(fields: { name: string; maxCount: number }[]): RequestHandler {
	return async (req, res, next) => {
		if (!req.is("multipart/form-data")) { res.locals.receivedImages = []; next(); return; }
		let directory: string | undefined;
		let receiving = true;
		let closed = false;
		let total = 0;
		const active = new Set<Readable>();
		const writes = new Set<Promise<void>>();
		const cleanup = async () => {
			if (!directory || receiving) return;
			await Promise.allSettled(writes);
			try { await rm(directory, { recursive: true, force: true }); }
			catch { logger.error("Unable to remove temporary image files"); }
		};
		const close = () => { closed = true; for (const stream of active) stream.destroy(new AppError("Upload interrupted", 400)); void cleanup(); };
		res.once("finish", close);
		res.once("close", close);
		req.once("aborted", close);
		try {
			directory = await mkdtemp(join(tmpdir(), "modofriki-media-"));
			if (closed || req.aborted) throw new AppError("Upload interrupted", 400);
			const destination = directory;
			const parser = multer({
				storage: {
					_handleFile(_req, file, callback) {
						const filename = randomUUID();
						const path = join(destination, filename);
						let size = 0;
						active.add(file.stream);
						const counter = new Transform({ transform(chunk: Buffer, _encoding, done) {
							total += chunk.length; size += chunk.length;
							done(total > MEDIA_LIMITS.totalBytes ? new AppError("Combined files exceed 100 MiB", 413) : null, chunk);
						} });
						const write = pipeline(file.stream, counter, createWriteStream(path, { flags: "wx", mode: 0o600 }))
							.then(() => callback(null, { destination, filename, path, size }))
							.catch((error: Error) => callback(error))
							.finally(() => { active.delete(file.stream); writes.delete(write); });
						writes.add(write);
					},
					_removeFile(_req, file, callback) { void rm(file.path, { force: true }).then(() => callback(null)).catch(callback); }
				},
				limits: { fileSize: MEDIA_LIMITS.fileBytes, files: fields.reduce((sum, field) => sum + field.maxCount, 0), fields: 30, fieldSize: 64 * 1024, fieldNameSize: 100, parts: 132, headerPairs: 100 }
			}).fields(fields);
			await new Promise<void>((resolve, reject) => parser(req, res, (error?: unknown) => error ? reject(error) : resolve()));
			receiving = false;
			if (closed || req.aborted) { await cleanup(); return; }
			const files = (req as Request & { files?: Record<string, ReceivedImage[]> }).files ?? {};
			res.locals.receivedImages = Object.values(files).flat();
			next();
		} catch (error) {
			receiving = false;
			for (const stream of active) stream.destroy(new AppError("Upload interrupted", 400));
			await cleanup();
			const code = (error as { code?: string })?.code;
			const normalized = code?.startsWith("LIMIT_") ? new AppError("Multipart upload exceeds allowed fields, size or count", code === "LIMIT_FILE_SIZE" ? 413 : 400) : error;
			return catchAndLogError(logger, normalized, "Unable to receive image files");
		}
	};
}

export const receiveWorkMedia = (): RequestHandler => receive([{ name: "cover", maxCount: 1 }, { name: "inpagecover", maxCount: 1 }]);
export const receiveChapterMedia = (): RequestHandler => receive([{ name: "pages", maxCount: MEDIA_LIMITS.chapterFiles }]);
