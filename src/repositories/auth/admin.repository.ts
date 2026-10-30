import prisma from "../../config/database/postgres";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type {
	AdminActor, AdminRepositoryContract, AdminUserListInput, AdminUserRecord,
	AssignmentListInput, AssignmentRecord, AssignmentVersionInput, ChangeRoleInput,
	CursorPageRecord
} from "../../types/admin.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { ADMIN_TRANSACTION_OPTIONS, lockUsers, readSqlTime } from "../user-locks";

const logger = createLogger("AdminRepository");
const userSelect = {
	id: true, username: true, role: true, status: true, createdAt: true, updatedAt: true
} satisfies Prisma.UserSelect;
const assignmentSelect = {
	id: true, workId: true, editorId: true, assignedById: true,
	assignedAt: true, revokedAt: true, version: true, createdAt: true
} satisfies Prisma.WorkEditorAssignmentSelect;

type AdminTransactionClient = Prisma.TransactionClient;

function persistenceFailure(error: unknown): AppError | unknown {
	if (error instanceof AppError) return error;
	if (typeof error === "object" && error !== null && "code" in error
		&& (error.code === "P2002" || error.code === "P2034")) {
		return new AppError("Administrative data changed; retry the request", 409);
	}
	return new AppError("Administrative persistence unavailable", 503);
}

export class AdminRepository implements AdminRepositoryContract {
	constructor(private readonly client: PrismaClient = prisma) {}

	private async requireActor(client: Pick<PrismaClient, "user"> | AdminTransactionClient, actor: AdminActor): Promise<void> {
		const current = await client.user.findUnique({
			where: { id: actor.id }, select: { role: true, status: true, deletedAt: true }
		});
		if (!current || current.role !== "ADMIN" || current.status !== "ACTIVE" || current.deletedAt !== null) {
			throw new AppError("Insufficient permissions", 403);
		}
	}

	private async requireSubject(tx: AdminTransactionClient, userId: string) {
		const subject = await tx.user.findUnique({ where: { id: userId } });
		if (!subject || subject.status === "DELETED" || subject.deletedAt !== null) throw new AppError("User not found", 404);
		if (subject.role === "ADMIN") throw new AppError("Protected administrator", 403);
		return subject;
	}

	private async lockWorks(tx: AdminTransactionClient, workIds: readonly string[]): Promise<void> {
		for (const workId of [...new Set(workIds.map(id => id.toLowerCase()))].sort()) {
			await tx.$queryRaw`SELECT "id" FROM "Work" WHERE "id" = ${workId}::uuid FOR UPDATE`;
		}
	}

	private userCursor(input: AdminUserListInput): Prisma.UserWhereInput {
		return input.cursor ? {
			OR: [
				{ createdAt: { gt: input.cursor.createdAt } },
				{ createdAt: input.cursor.createdAt, id: { gt: input.cursor.id } }
			]
		} : {};
	}

	private assignmentCursor(input: AssignmentListInput): Prisma.WorkEditorAssignmentWhereInput {
		return input.cursor ? {
			OR: [
				{ createdAt: { gt: input.cursor.createdAt } },
				{ createdAt: input.cursor.createdAt, id: { gt: input.cursor.id } }
			]
		} : {};
	}

	private page<T extends { id: string; createdAt: Date }>(rows: T[], limit: number): CursorPageRecord<T> {
		const hasMore = rows.length > limit;
		const items = hasMore ? rows.slice(0, limit) : rows;
		const tail = items.at(-1);
		return { items, hasMore, nextCursor: hasMore && tail ? { createdAt: tail.createdAt, id: tail.id } : null };
	}

	async listUsers(actor: AdminActor, input: AdminUserListInput): Promise<CursorPageRecord<AdminUserRecord>> {
		try {
			await this.requireActor(this.client, actor);
			const limit = Math.min(input.limit ?? 20, 100);
			const rows = await this.client.user.findMany({
				where: {
					deletedAt: null, status: input.status ?? { in: ["ACTIVE", "SUSPENDED"] },
					...(input.role ? { role: input.role } : {}), ...this.userCursor(input)
				},
				select: userSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit + 1
			});
			return this.page(rows as AdminUserRecord[], limit);
		} catch (error) { return catchAndLogError(logger, persistenceFailure(error), "Unable to list administrative users"); }
	}

	async findUser(actor: AdminActor, userId: string): Promise<AdminUserRecord | null> {
		try {
			await this.requireActor(this.client, actor);
			return await this.client.user.findUnique({
				where: { id: userId, deletedAt: null, status: { not: "DELETED" } }, select: userSelect
			}) as AdminUserRecord | null;
		} catch (error) { return catchAndLogError(logger, persistenceFailure(error), "Unable to read administrative user"); }
	}

	async changeRole(actor: AdminActor, userId: string, input: ChangeRoleInput): Promise<AdminUserRecord> {
		try {
			return await this.client.$transaction(async tx => {
				await lockUsers(tx, [actor.id, userId]);
				await this.requireActor(tx, actor);
				const subject = await this.requireSubject(tx, userId);
				if (subject.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new AppError("User was modified; reload it", 409);
				if (subject.role === input.role) return tx.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect }) as Promise<AdminUserRecord>;

				const activeAssignments = input.role === "BASIC"
					? await tx.workEditorAssignment.findMany({ where: { editorId: userId, revokedAt: null }, select: { id: true, workId: true } })
					: [];
				await this.lockWorks(tx, activeAssignments.map(row => row.workId));
				const now = await readSqlTime(tx);
				const updatedAt = new Date(Math.max(now.getTime(), subject.updatedAt.getTime() + 1));

				await tx.user.update({ where: { id: userId }, data: { role: input.role, updatedAt } });
				const audits: Prisma.AdminAuditEventCreateManyInput[] = [{
					actorId: actor.id, subjectUserId: userId, action: "ROLE_CHANGED",
					previousRole: subject.role, newRole: input.role, occurredAt: now
				}];
				for (const assignment of activeAssignments) {
					await tx.workEditorAssignment.update({
						where: { id: assignment.id }, data: { revokedAt: now, version: { increment: 1 } }
					});
					audits.push({ actorId: actor.id, subjectUserId: userId, workId: assignment.workId,
						action: "EDITOR_REVOKED", occurredAt: now });
				}
				await tx.adminAuditEvent.createMany({ data: audits });
				return await tx.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect }) as AdminUserRecord;
			}, ADMIN_TRANSACTION_OPTIONS);
		} catch (error) { return catchAndLogError(logger, persistenceFailure(error), "Unable to change administrative role"); }
	}

	async listAssignments(actor: AdminActor, userId: string, input: AssignmentListInput): Promise<CursorPageRecord<AssignmentRecord>> {
		try {
			await this.requireActor(this.client, actor);
			const subject = await this.client.user.findUnique({ where: { id: userId }, select: { status: true, deletedAt: true } });
			if (!subject || subject.status === "DELETED" || subject.deletedAt !== null) throw new AppError("User not found", 404);
			const limit = Math.min(input.limit ?? 20, 100);
			const rows = await this.client.workEditorAssignment.findMany({
				where: {
					editorId: userId, ...(input.includeRevoked ? {} : { revokedAt: null }),
					...this.assignmentCursor(input)
				},
				select: assignmentSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit + 1
			});
			return this.page(rows as AssignmentRecord[], limit);
		} catch (error) { return catchAndLogError(logger, persistenceFailure(error), "Unable to list editor assignments"); }
	}

	async assign(actor: AdminActor, editorId: string, workId: string, input: AssignmentVersionInput): Promise<AssignmentRecord> {
		try {
			return await this.client.$transaction(async tx => {
				await lockUsers(tx, [actor.id, editorId]);
				await this.requireActor(tx, actor);
				const editor = await this.requireSubject(tx, editorId);
				if (editor.role !== "EDITOR" || editor.status !== "ACTIVE") throw new AppError("Active editor required", 403);
				await this.lockWorks(tx, [workId]);
				const work = await tx.work.findUnique({ where: { id: workId }, select: { deletedAt: true } });
				if (!work || work.deletedAt !== null) throw new AppError("Work not found", 404);
				const current = await tx.workEditorAssignment.findUnique({
					where: { workId_editorId: { workId, editorId } }, select: assignmentSelect
				});
				if ((current?.version ?? 0) !== input.expectedVersion) throw new AppError("Assignment was modified; reload it", 409);
				if (current?.revokedAt === null) return current as AssignmentRecord;
				const now = await readSqlTime(tx);
				const assignment = current
					? await tx.workEditorAssignment.update({
						where: { id: current.id }, data: { assignedById: actor.id, assignedAt: now, revokedAt: null, version: { increment: 1 } },
						select: assignmentSelect
					})
					: await tx.workEditorAssignment.create({
						data: { workId, editorId, assignedById: actor.id, assignedAt: now, createdAt: now, version: 1 },
						select: assignmentSelect
					});
				await tx.adminAuditEvent.create({ data: {
					actorId: actor.id, subjectUserId: editorId, workId, action: "EDITOR_ASSIGNED", occurredAt: now
				} });
				return assignment as AssignmentRecord;
			}, ADMIN_TRANSACTION_OPTIONS);
		} catch (error) { return catchAndLogError(logger, persistenceFailure(error), "Unable to assign editor"); }
	}

	async revoke(actor: AdminActor, editorId: string, workId: string, input: AssignmentVersionInput): Promise<AssignmentRecord> {
		try {
			return await this.client.$transaction(async tx => {
				await lockUsers(tx, [actor.id, editorId]);
				await this.requireActor(tx, actor);
				await this.requireSubject(tx, editorId);
				await this.lockWorks(tx, [workId]);
				const current = await tx.workEditorAssignment.findUnique({
					where: { workId_editorId: { workId, editorId } }, select: assignmentSelect
				});
				if (!current) throw new AppError("Assignment not found", 404);
				if (current.version !== input.expectedVersion) throw new AppError("Assignment was modified; reload it", 409);
				if (current.revokedAt !== null) return current as AssignmentRecord;
				const now = await readSqlTime(tx);
				const assignment = await tx.workEditorAssignment.update({
					where: { id: current.id }, data: { revokedAt: now, version: { increment: 1 } }, select: assignmentSelect
				});
				await tx.adminAuditEvent.create({ data: {
					actorId: actor.id, subjectUserId: editorId, workId, action: "EDITOR_REVOKED", occurredAt: now
				} });
				return assignment as AssignmentRecord;
			}, ADMIN_TRANSACTION_OPTIONS);
		} catch (error) { return catchAndLogError(logger, persistenceFailure(error), "Unable to revoke editor assignment"); }
	}
}

export const adminRepository = new AdminRepository();
