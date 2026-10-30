import type { UserRole } from "../generated/prisma/enums";

/** Role is a hint from authentication; repositories revalidate the current SQL account. */
export interface AdminActor { id: string; role: UserRole }
export type ManagedRole = Extract<UserRole, "BASIC" | "EDITOR">;
export type AdminUserStatus = "ACTIVE" | "SUSPENDED";

export interface DateCursor { createdAt: Date; id: string }
export interface CursorDto { createdAt: string; id: string }
export interface CursorPageInput { limit?: number; cursor?: DateCursor }
export interface CursorPageRecord<T> { items: T[]; hasMore: boolean; nextCursor: DateCursor | null }
export interface CursorPage<T> { items: T[]; hasMore: boolean; nextCursor: CursorDto | null }

/** Explicit allowlist: never use the authentication User record as the admin projection. */
export interface AdminUserRecord {
	id: string;
	username: string;
	role: UserRole;
	status: AdminUserStatus;
	createdAt: Date;
	updatedAt: Date;
}
export interface AdminUserDto extends Omit<AdminUserRecord, "createdAt" | "updatedAt"> {
	createdAt: string;
	updatedAt: string;
}
export interface AdminUserListInput extends CursorPageInput { role?: UserRole; status?: AdminUserStatus }
export interface ChangeRoleInput { role: ManagedRole; expectedUpdatedAt: Date }

export interface AssignmentRecord {
	id: string;
	workId: string;
	editorId: string;
	assignedById: string;
	assignedAt: Date;
	revokedAt: Date | null;
	version: number;
	/** Immutable even on reassignment; backfilled from historical assignedAt. */
	createdAt: Date;
}
export interface AssignmentDto extends Omit<AssignmentRecord, "assignedAt" | "revokedAt" | "createdAt"> {
	assignedAt: string;
	revokedAt: string | null;
	createdAt: string;
}
export interface AssignmentListInput extends CursorPageInput { includeRevoked?: boolean }
export interface AssignmentVersionInput { expectedVersion: number }

export interface AdminRepositoryContract {
	listUsers(actor: AdminActor, input: AdminUserListInput): Promise<CursorPageRecord<AdminUserRecord>>;
	findUser(actor: AdminActor, userId: string): Promise<AdminUserRecord | null>;
	/** Stale CAS is 409 even on a no-op; downgrade revocations and audit commit together. */
	changeRole(actor: AdminActor, userId: string, input: ChangeRoleInput): Promise<AdminUserRecord>;
	listAssignments(actor: AdminActor, userId: string, input: AssignmentListInput): Promise<CursorPageRecord<AssignmentRecord>>;
	assign(actor: AdminActor, editorId: string, workId: string, input: AssignmentVersionInput): Promise<AssignmentRecord>;
	revoke(actor: AdminActor, editorId: string, workId: string, input: AssignmentVersionInput): Promise<AssignmentRecord>;
}
