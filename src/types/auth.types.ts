import type { User } from "../generated/prisma/client";
import type { UserRole } from "../generated/prisma/enums";

export type { UserRole } from "../generated/prisma/enums";
export type UserRecord = User;
export type PublicAuthorRecord = Pick<UserRecord, "id" | "username" | "status" | "deletedAt">;

export interface UserDto {
	id: string;
	email: string;
	username: string;
	role: UserRole;
	timezone: string;
	createdAt: string;
}

export interface AuthResult {
	user: UserDto;
	token: string;
}

export interface CreateUserInput {
	email: string;
	username: string;
	passwordHash: string;
	timezone?: string;
}

export interface AuthRepositoryContract {
	findByEmail(email: string): Promise<UserRecord | null>;
	findById(id: string): Promise<UserRecord | null>;
	findByIds(ids: string[]): Promise<PublicAuthorRecord[]>;
	create(input: CreateUserInput): Promise<UserRecord>;
}
