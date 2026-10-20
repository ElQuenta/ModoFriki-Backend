import type { UserDto } from "./auth.types";

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
			user?: UserDto;
			authenticated?: boolean;
		}
	}
}
