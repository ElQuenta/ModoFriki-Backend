import type { UserDto } from "./auth.types";
import type { CatalogPrepared } from "../services/catalog/catalog.service";
import type { UploadedMedia, UploadContext } from "./catalog.types";
import type { ReceivedImage, ValidatedImage } from "../middlewares/media/types";

export type Role = "BASIC" | "EDITOR" | "ADMIN";

export interface AuthUser {
	id: string;
	role: Role;
}

declare global {
	namespace Express {
		interface Request {
			user?: AuthUser;
		}
		interface Locals {
			receivedImages?: ReceivedImage[];
			validatedImages?: ValidatedImage[];
			uploadedMedia?: UploadedMedia;
			uploadContext?: UploadContext;
			catalogPrepared?: CatalogPrepared;
			catalogSaved?: { record: unknown; creating: boolean };
			user?: UserDto;
			authenticated?: boolean;
		}
	}
}
