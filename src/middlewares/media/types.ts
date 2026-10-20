import type { Request, Response } from "express";
import type { MediaRepositoryContract, UploadContext } from "../../types/catalog.types";

export interface ReceivedImage { fieldname: string; path: string; size: number; mimetype: string }
export interface ValidatedImage {
	fieldName: string;
	index: number;
	path: string;
	size: number;
	contentType: "image/jpeg" | "image/png" | "image/webp";
	extension: "jpg" | "png" | "webp";
}
export interface MediaPlanObject {
	pathname: string;
	contentType: string;
	size: number;
	fieldName?: string;
	position?: number;
	fileIndex?: number;
	/** Trusted stored pathname read from the repository, never a URL supplied by a client. */
	sourcePathname?: string;
}
export interface MediaPlan { context: UploadContext; objects: MediaPlanObject[] }
export interface BlobResult { pathname: string; url: string; contentType: string }
export interface BlobOperations {
	put(pathname: string, file: ValidatedImage, signal: AbortSignal): Promise<BlobResult>;
	copy(source: string, pathname: string, contentType: string, signal: AbortSignal): Promise<BlobResult>;
}
export interface UploadMediaOptions {
	repository: MediaRepositoryContract;
	plan(req: Request, res: Response, files: ValidatedImage[]): Promise<MediaPlan>;
	blob?: BlobOperations;
}
