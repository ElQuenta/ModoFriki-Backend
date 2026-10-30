import { randomBytes, randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import sharp from "sharp";
import config from "../../config/env";
import { mediaThumbnailRepository, type MediaThumbnailRepository } from "../../repositories/catalog/media-thumbnail.repository";
import { assertMediaPath } from "../../utils/media-paths";
import { createLogger } from "../../utils/logger";

const logger = createLogger("MediaThumbnails");
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export type FetchImage = (url: string) => Promise<Buffer>;
export type PutImage = (pathname: string, body: Buffer) => Promise<{ url: string }>;

export const fetchImage: FetchImage = async url => {
	const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
	if (!response.ok) throw new Error("SOURCE_UNAVAILABLE");
	if (Number(response.headers.get("content-length") ?? 0) > MAX_SOURCE_BYTES) throw new Error("SOURCE_TOO_LARGE");
	const body = Buffer.from(await response.arrayBuffer());
	if (body.length > MAX_SOURCE_BYTES) throw new Error("SOURCE_TOO_LARGE");
	return body;
};

export const putToBlob: PutImage = async (pathname, body) => {
	if (!config.blob.readWriteToken) throw new Error("MEDIA_NOT_CONFIGURED");
	return put(pathname, body, { token: config.blob.readWriteToken, access: "public", addRandomSuffix: false, allowOverwrite: false, contentType: "image/webp", abortSignal: AbortSignal.timeout(30_000) });
};

export interface ThumbnailOptions {
	width?: number;
	batchSize?: number;
	repository?: Pick<MediaThumbnailRepository, "findPending" | "link">;
	fetch?: FetchImage;
	put?: PutImage;
}
export interface ThumbnailReport { pending: number; created: number; stale: number; failed: number }

/** Same folder as the cover, fresh 4-hex name (the pipeline's naming, so assertMediaPath accepts it). */
export function thumbnailPath(coverPathname: string): string {
	const pathname = `${coverPathname.slice(0, coverPathname.lastIndexOf("/"))}/${randomBytes(2).toString("hex")}.webp`;
	assertMediaPath(pathname);
	return pathname;
}

export async function generateThumbnails(options: ThumbnailOptions = {}): Promise<ThumbnailReport> {
	const { width = 300, batchSize = 50, repository = mediaThumbnailRepository, fetch: load = fetchImage, put: store = putToBlob } = options;
	const pending = await repository.findPending(batchSize);
	const report: ThumbnailReport = { pending: pending.length, created: 0, stale: 0, failed: 0 };
	for (const item of pending) {
		try {
			// rotate() applies EXIF orientation; never enlarge small covers.
			const { data, info } = await sharp(await load(item.coverUrl)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer({ resolveWithObject: true });
			let stored: { url: string } | undefined;
			let pathname = "";
			// Random 4-hex names can collide with an existing file (overwrite is disabled): one retry.
			for (let attempt = 0; !stored; attempt++) {
				pathname = thumbnailPath(item.coverPathname);
				try { stored = await store(pathname, data); }
				catch (error) { if (attempt >= 1) throw error; }
			}
			const linked = await repository.link(item, { id: randomUUID(), pathname, url: stored.url, size: data.length, width: info.width, height: info.height });
			if (linked) report.created++; else report.stale++;
		} catch (error) {
			// Short code only: never provider messages or tokens.
			logger.warn(`Thumbnail skipped for work ${item.workId}: ${error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ERROR"}`);
			report.failed++;
		}
	}
	return report;
}
