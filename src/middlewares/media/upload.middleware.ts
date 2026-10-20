import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import type { UploadedMedia } from "../../types/catalog.types";
import AppError from "../../utils/AppError";
import { assertMediaPath } from "../../utils/media-paths";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { blobOperations } from "./blob";
import type { UploadMediaOptions, ValidatedImage } from "./types";

const logger = createLogger("MediaUpload");
export const uploadMedia = ({ repository, plan, blob = blobOperations }: UploadMediaOptions): RequestHandler => async (req, res, next) => {
	let batchId: string | undefined;
	const abort = new AbortController();
	let completed = false;
	let abandoned = false;
	const abandon = async () => {
		if (!batchId || abandoned) return;
		try { await repository.abandonBatch(batchId); abandoned = true; }
		catch { logger.error("Unable to mark upload batch abandoned; stored files are retained"); }
	};
	const disconnected = () => {
		if (completed && res.writableFinished && res.statusCode < 400) return;
		abort.abort();
		void abandon();
	};
	res.once("close", disconnected);
	res.once("finish", () => { if (res.statusCode >= 400) void abandon(); });
	req.once("aborted", disconnected);
	const timer = setTimeout(() => abort.abort(), 10 * 60 * 1000);
	timer.unref();
	try {
		res.locals.uploadedMedia = [];
		const files: ValidatedImage[] = res.locals.validatedImages ?? [];
		const prepared = await plan(req, res, files);
		res.locals.uploadContext = prepared.context;
		if (prepared.objects.length === 0) { completed = true; next(); return; }
		if (prepared.objects.length > 1000) throw new AppError("A chapter cannot exceed 1000 pages", 400);
		const paths = new Set<string>();
		const usedFiles = new Set<number>();
		for (const object of prepared.objects) {
			assertMediaPath(object.pathname);
			if (!object.pathname.startsWith(`${prepared.context.workSlug}/`)) throw new AppError("Invalid media destination", 400);
			if (paths.has(object.pathname)) throw new AppError("Duplicate media destination", 400);
			paths.add(object.pathname);
			if ((object.fileIndex === undefined) === (object.sourcePathname === undefined)) throw new AppError("Invalid media source", 400);
			if (!["image/jpeg", "image/png", "image/webp"].includes(object.contentType) || !Number.isSafeInteger(object.size) || object.size < 1 || object.size > 10 * 1024 * 1024) throw new AppError("Invalid image metadata", 400);
			if (object.fileIndex !== undefined) {
				const file = files[object.fileIndex];
				if (!file || usedFiles.has(object.fileIndex) || file.contentType !== object.contentType || file.size !== object.size) throw new AppError("Invalid received image reference", 400);
				usedFiles.add(object.fileIndex);
			} else {
				assertMediaPath(object.sourcePathname!);
				if (!object.sourcePathname!.startsWith(`${prepared.context.workSlug}/`) || object.sourcePathname === object.pathname) throw new AppError("Invalid stored image reference", 400);
			}
		}
		if (usedFiles.size !== files.length) throw new AppError("Unassigned uploaded images", 400);
		if (abort.signal.aborted) throw new AppError("Upload interrupted", 400);
		batchId = prepared.context.batchId ?? (await repository.beginBatch({ actorId: prepared.context.actorId,
			...(prepared.context.chapterId ? { chapterId: prepared.context.chapterId } : { workId: prepared.context.workId }) })).id;
		prepared.context.batchId = batchId;
		const reserved = [];
		// Reserve the entire generation before any external effect, including all retained copies.
		for (const object of prepared.objects) reserved.push({ ...object, journalId: (await repository.planObject(batchId, object.pathname)).id });
		const uploaded: UploadedMedia = [];
		for (const object of reserved) {
			if (abort.signal.aborted) throw new AppError("Upload interrupted", 400);
			const result = object.fileIndex !== undefined
				? await blob.put(object.pathname, files[object.fileIndex], abort.signal)
				: await blob.copy(object.sourcePathname!, object.pathname, object.contentType, abort.signal);
			if (result.pathname !== object.pathname || result.contentType !== object.contentType || !/^https:\/\//.test(result.url)) throw new AppError("Unexpected media storage response", 502);
			await repository.markUploaded(batchId, object.pathname);
			uploaded.push({ id: randomUUID(), pathname: object.pathname, url: result.url, contentType: object.contentType,
				size: object.size, ...(object.fieldName !== undefined ? { fieldName: object.fieldName } : {}),
				...(object.position !== undefined ? { position: object.position } : {}) });
		}
		res.locals.uploadedMedia = uploaded;
		completed = true;
		next();
	} catch (error) {
		abort.abort();
		await abandon();
		return catchAndLogError(logger, error, "Unable to upload image files");
	} finally { clearTimeout(timer); }
};
