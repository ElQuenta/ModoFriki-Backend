import type { UserDto } from "./auth.types";
import type { CatalogPrepared } from "../services/catalog/catalog.service";

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
			catalogPrepared?: CatalogPrepared;
			user?: UserDto;
			authenticated?: boolean;
		}
	}
}
