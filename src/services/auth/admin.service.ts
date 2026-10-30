import { adminRepository } from "../../repositories/auth/admin.repository";
import type {
	AdminActor, AdminRepositoryContract, AdminUserDto, AdminUserListInput, AdminUserRecord,
	AssignmentDto, AssignmentListInput, AssignmentRecord, AssignmentVersionInput, ChangeRoleInput,
	CursorPage, CursorPageRecord
} from "../../types/admin.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("AdminService");

export class AdminService {
	constructor(private readonly repository: AdminRepositoryContract = adminRepository) {}

	private requireAdmin(actor: AdminActor): void {
		if (actor.role !== "ADMIN") throw new AppError("Insufficient permissions", 403);
	}

	private userDto(user: AdminUserRecord): AdminUserDto {
		return {
			id: user.id, username: user.username, role: user.role, status: user.status,
			createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString()
		};
	}

	private assignmentDto(assignment: AssignmentRecord): AssignmentDto {
		return {
			id: assignment.id, workId: assignment.workId, editorId: assignment.editorId,
			assignedById: assignment.assignedById, assignedAt: assignment.assignedAt.toISOString(),
			revokedAt: assignment.revokedAt?.toISOString() ?? null, version: assignment.version,
			createdAt: assignment.createdAt.toISOString()
		};
	}

	private page<TRecord, TDto>(page: CursorPageRecord<TRecord>, project: (value: TRecord) => TDto): CursorPage<TDto> {
		return {
			items: page.items.map(project), hasMore: page.hasMore,
			nextCursor: page.nextCursor
				? { createdAt: page.nextCursor.createdAt.toISOString(), id: page.nextCursor.id }
				: null
		};
	}

	private async subject(actor: AdminActor, userId: string): Promise<AdminUserRecord> {
		const user = await this.repository.findUser(actor, userId);
		if (!user) throw new AppError("User not found", 404);
		return user;
	}

	private requireManaged(user: AdminUserRecord): void {
		if (user.role === "ADMIN") throw new AppError("Protected administrator", 403);
	}

	async listUsers(actor: AdminActor, input: AdminUserListInput = {}): Promise<CursorPage<AdminUserDto>> {
		try {
			this.requireAdmin(actor);
			return this.page(await this.repository.listUsers(actor, input), value => this.userDto(value));
		} catch (error) { return catchAndLogError(logger, error, "Unable to list administrative users"); }
	}

	async getUser(actor: AdminActor, userId: string): Promise<AdminUserDto> {
		try {
			this.requireAdmin(actor);
			return this.userDto(await this.subject(actor, userId));
		} catch (error) { return catchAndLogError(logger, error, "Unable to read administrative user"); }
	}

	async changeRole(actor: AdminActor, userId: string, input: ChangeRoleInput): Promise<AdminUserDto> {
		try {
			this.requireAdmin(actor);
			this.requireManaged(await this.subject(actor, userId));
			return this.userDto(await this.repository.changeRole(actor, userId, input));
		} catch (error) { return catchAndLogError(logger, error, "Unable to change administrative role"); }
	}

	async listAssignments(actor: AdminActor, userId: string, input: AssignmentListInput = {}): Promise<CursorPage<AssignmentDto>> {
		try {
			this.requireAdmin(actor);
			this.requireManaged(await this.subject(actor, userId));
			return this.page(await this.repository.listAssignments(actor, userId, input), value => this.assignmentDto(value));
		} catch (error) { return catchAndLogError(logger, error, "Unable to list editor assignments"); }
	}

	async assign(actor: AdminActor, userId: string, workId: string, input: AssignmentVersionInput): Promise<AssignmentDto> {
		try {
			this.requireAdmin(actor);
			const user = await this.subject(actor, userId);
			this.requireManaged(user);
			if (user.role !== "EDITOR" || user.status !== "ACTIVE") throw new AppError("Active editor required", 403);
			return this.assignmentDto(await this.repository.assign(actor, userId, workId, input));
		} catch (error) { return catchAndLogError(logger, error, "Unable to assign editor"); }
	}

	async revoke(actor: AdminActor, userId: string, workId: string, input: AssignmentVersionInput): Promise<AssignmentDto> {
		try {
			this.requireAdmin(actor);
			this.requireManaged(await this.subject(actor, userId));
			return this.assignmentDto(await this.repository.revoke(actor, userId, workId, input));
		} catch (error) { return catchAndLogError(logger, error, "Unable to revoke editor assignment"); }
	}
}

export const adminService = new AdminService();
