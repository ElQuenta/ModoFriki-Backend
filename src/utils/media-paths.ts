import { randomUUID } from "node:crypto";
import AppError from "./AppError";

export const shortId = (id: string = randomUUID()): string => id.replace(/-/g, "").slice(0, 4).toLowerCase();

export function createWorkSlug(title: string, id: string): string {
	const slug = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
		.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "") || "work";
	return `${slug}-${shortId(id)}`;
}

function segment(value: string): string {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 120) throw new AppError("Invalid media path", 400);
	return value;
}

function identifier(value: string): string {
	if (!/^[a-f0-9]{4}$/.test(value)) throw new AppError("Invalid media identifier", 400);
	return value;
}

function extension(value: string): string {
	if (!["jpg", "png", "webp"].includes(value)) throw new AppError("Unsupported image format", 400);
	return value;
}

export function workMediaPath(slug: string, field: "cover" | "banner" | "inpagecover", id: string, ext: string): string {
	const namespace = field === "cover" ? "Covers" : field === "banner" ? "Banners" : "CoverPage";
	return `${segment(slug)}/${namespace}/${identifier(id)}.${extension(ext)}`;
}

export function chapterMediaPath(slug: string, chapterId: string, generation: string, position: number, ext: string): string {
	if (!Number.isSafeInteger(position) || position < 1 || position > 1000) throw new AppError("Invalid page position", 400);
	return `${segment(slug)}/Chapter-${identifier(shortId(chapterId))}/${identifier(generation)}-${position}.${extension(ext)}`;
}

/** Restricts remote destinations to the server generated namespace, never client filenames. */
export function assertMediaPath(pathname: string): void {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/(?:Covers|Banners|CoverPage)\/[a-f0-9]{4}\.(?:jpg|png|webp)$/.test(pathname)
		&& !/^[a-z0-9]+(?:-[a-z0-9]+)*\/Chapter-[a-f0-9]{4}\/[a-f0-9]{4}-[1-9][0-9]{0,3}\.(?:jpg|png|webp)$/.test(pathname)) {
		throw new AppError("Invalid media destination", 400);
	}
}
