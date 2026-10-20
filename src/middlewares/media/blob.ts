import { createReadStream } from "node:fs";
import { copy, put } from "@vercel/blob";
import config from "../../config/env";
import AppError from "../../utils/AppError";
import type { BlobOperations } from "./types";

function token(): string {
	if (!config.blob.readWriteToken) throw new AppError("Media storage is not configured", 503);
	return config.blob.readWriteToken;
}

export const blobOperations: BlobOperations = {
	async put(pathname, file, abortSignal) {
		const credential = token();
		const stream = createReadStream(file.path);
		try {
			return await put(pathname, stream, { token: credential, access: "public", addRandomSuffix: false,
				allowOverwrite: false, contentType: file.contentType, abortSignal });
		} finally { stream.destroy(); }
	},
	async copy(source, pathname, contentType, abortSignal) {
		return copy(source, pathname, { token: token(), access: "public", addRandomSuffix: false,
			allowOverwrite: false, contentType, abortSignal });
	}
};
