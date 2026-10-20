import AppError from "../../utils/AppError";
import { inflateSync } from "node:zlib";
import type { ValidatedImage } from "./types";

const invalid = (): never => { throw new AppError("Invalid or unsupported image content", 400); };
const dimensions = (width: number, height: number): void => {
	if (!width || !height || width > 40000 || height > 40000 || width * height > 40_000_000) invalid();
};

function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function png(data: Buffer): void {
	let offset = 8;
	let imageData = false;
	let header = false;
	let ended = false;
	let width = 0;
	let height = 0;
	let depth = 0;
	let color = 0;
	let interlace = 0;
	let palette = false;
	let dataEnded = false;
	const compressed: Buffer[] = [];
	while (offset + 12 <= data.length) {
		const length = data.readUInt32BE(offset);
		const end = offset + 12 + length;
		if (end > data.length) invalid();
		const type = data.toString("ascii", offset + 4, offset + 8);
		if (!/^[A-Za-z]{4}$/.test(type) || crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)) invalid();
		if (!header && type !== "IHDR") invalid();
		if (type === "IHDR") {
			if (header || length !== 13) invalid();
			width = data.readUInt32BE(offset + 8); height = data.readUInt32BE(offset + 12);
			dimensions(width, height);
			depth = data[offset + 16];
			color = data[offset + 17];
			interlace = data[offset + 20];
			const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
			if (!depths[color]?.includes(depth) || data[offset + 18] !== 0 || data[offset + 19] !== 0 || data[offset + 20] > 1) invalid();
			header = true;
		}
		if (type === "PLTE") {
			if (imageData || palette || length === 0 || length % 3 || length > 768) invalid();
			palette = true;
		}
		if (type === "IDAT") {
			if (dataEnded || (color === 3 && !palette)) invalid();
			if (length > 0) imageData = true;
			compressed.push(data.subarray(offset + 8, end - 4));
		} else if (imageData) dataEnded = true;
		if (!["IHDR", "PLTE", "IDAT", "IEND"].includes(type) && type[0] === type[0].toUpperCase()) invalid();
		if (type === "IEND") {
			if (length !== 0 || !imageData || end !== data.length) invalid();
			ended = true;
			break;
		}
		offset = end;
	}
	if (!ended) invalid();
	const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
	const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
	const rows: { bytes: number; count: number }[] = [];
	let expected = 0;
	for (const [x, y, dx, dy] of passes) {
		const passWidth = Math.max(0, Math.ceil((width - x) / dx));
		const passHeight = Math.max(0, Math.ceil((height - y) / dy));
		if (!passWidth || !passHeight) continue;
		const bytes = Math.ceil(passWidth * channels[color] * depth / 8) + 1;
		expected += bytes * passHeight;
		rows.push({ bytes, count: passHeight });
	}
	if (expected > 100 * 1024 * 1024) invalid();
	let raster: Buffer;
	try { raster = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected }); } catch { return invalid(); }
	if (raster.length !== expected) invalid();
	let rowOffset = 0;
	for (const row of rows) for (let count = 0; count < row.count; count++) {
		if (raster[rowOffset] > 4) invalid();
		rowOffset += row.bytes;
	}
}

function jpeg(data: Buffer): void {
	let offset = 2;
	let frame = false;
	let scan = false;
	while (offset < data.length) {
		if (data[offset++] !== 0xff) invalid();
		while (data[offset] === 0xff) offset++;
		const marker = data[offset++];
		if (marker === 0xd9) { if (!frame || !scan || offset !== data.length) invalid(); return; }
		if (marker === undefined || marker === 0 || marker === 0xd8 || offset + 2 > data.length) invalid();
		const length = data.readUInt16BE(offset);
		if (length < 2 || offset + length > data.length) invalid();
		if ([0xc0, 0xc1, 0xc2].includes(marker)) {
			if (length < 8 || data[offset + 2] !== 8) invalid();
			dimensions(data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3));
			const components = data[offset + 7];
			if (![1, 3, 4].includes(components) || length !== 8 + 3 * components) invalid();
			frame = true;
		}
		offset += length;
		if (marker === 0xda) {
			if (!frame || length < 6) invalid();
			scan = true;
			const start = offset;
			while (offset < data.length) {
				if (data[offset] !== 0xff) { offset++; continue; }
				const next = data[offset + 1];
				if (next === 0 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
				break;
			}
			if (offset === start) invalid();
		}
	}
	invalid();
}

function webp(data: Buffer): void {
	if (data.length < 20 || data.readUInt32LE(4) !== data.length - 8) invalid();
	let offset = 12;
	let frame = false;
	while (offset + 8 <= data.length) {
		const type = data.toString("ascii", offset, offset + 4);
		const size = data.readUInt32LE(offset + 4);
		const start = offset + 8;
		const end = start + size;
		if (end > data.length) invalid();
		if (type === "VP8 ") {
			if (size < 10 || (data[start] & 1) !== 0 || !data.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) invalid();
			dimensions(data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff); frame = true;
		} else if (type === "VP8L") {
			if (size < 5 || data[start] !== 0x2f || (data[start + 4] & 0xe0) !== 0) invalid();
			const bits = data.readUInt32LE(start + 1);
			dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1); frame = true;
		} else if (type === "VP8X") {
			if (size !== 10 || (data[start] & 0x02) !== 0) invalid(); // Animated WebP is deliberately excluded.
			dimensions(data.readUIntLE(start + 4, 3) + 1, data.readUIntLE(start + 7, 3) + 1);
		} else if (type === "ANIM" || type === "ANMF") invalid();
		offset = end + (size % 2);
	}
	if (!frame || offset !== data.length) invalid();
}

export function inspectImage(data: Buffer, declaredMime: string): Pick<ValidatedImage, "contentType" | "extension"> {
	let format: Pick<ValidatedImage, "contentType" | "extension">;
	if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
		png(data); format = { contentType: "image/png", extension: "png" };
	} else if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
		jpeg(data); format = { contentType: "image/jpeg", extension: "jpg" };
	} else if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
		webp(data); format = { contentType: "image/webp", extension: "webp" };
	} else return invalid();
	if (declaredMime.toLowerCase() !== format.contentType) throw new AppError("Image MIME does not match its contents", 400);
	return format;
}
