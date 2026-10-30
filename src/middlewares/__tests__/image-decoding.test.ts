import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { validateImages } from "../media/validate.middleware";

describe("image decoding before Blob", () => {
	async function validate(data: Buffer, mimetype: string) {
		const directory = await mkdtemp(join(tmpdir(), "mf-decode-"));
		try {
			const path = join(directory, "upload"); await writeFile(path, data);
			const res = { locals: { receivedImages: [{ path, mimetype, fieldname: "banner", size: data.length }] } };
			const next = vi.fn();
			await validateImages()({} as any, res as any, next);
			return { res, next };
		} finally { await rm(directory, { recursive: true }); }
	}
	it.each(["png", "jpeg", "webp"] as const)("accepts a decodable %s", async format => {
		const data = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).toFormat(format).toBuffer();
		const result = await validate(data, `image/${format}`);
		expect(result.next).toHaveBeenCalledOnce();
		expect(result.res.locals).toHaveProperty("validatedImages.0.contentType", `image/${format}`);
	});
	it("rejects a structurally plausible WebP with no compressed image", async () => {
		const data = Buffer.alloc(30); data.write("RIFF"); data.writeUInt32LE(22, 4); data.write("WEBPVP8 ", 8);
		data.writeUInt32LE(10, 16); data.set([0x9d, 1, 0x2a], 23); data.writeUInt16LE(1, 26); data.writeUInt16LE(1, 28);
		await expect(validate(data, "image/webp")).rejects.toMatchObject({ statusCode: 400 });
	});
});
