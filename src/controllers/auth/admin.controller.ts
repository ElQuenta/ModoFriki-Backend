import type { RequestHandler } from "express";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { SuccessResponseHandler } from "../../handlers/success.handler";
import { adminService, type AdminService } from "../../services/auth/admin.service";
import type { AdminActor, AdminUserListInput, AssignmentListInput } from "../../types/admin.types";
import AppError from "../../utils/AppError";
import { createLogger } from "../../utils/logger";

const logger = createLogger("AdminController");
type Service = Pick<AdminService, "listUsers" | "getUser" | "changeRole" | "listAssignments" | "assign" | "revoke">;

export class AdminController {
	constructor(private readonly service: Service = adminService) {}

	private actor(res: Parameters<RequestHandler>[1]): AdminActor {
		if (!res.locals.authenticated || !res.locals.user) throw new AppError("Authentication required", 401);
		return { id: res.locals.user.id, role: res.locals.user.role };
	}

	private handle(action: RequestHandler): RequestHandler {
		return async (req, res, next) => {
			try { await action(req, res, next); }
			catch (error) { logger.error("Unable to handle administrative request"); ErrorResponseHandler(res, error); }
		};
	}

	private cursor(query: Record<string, unknown>) {
		return query.cursorCreatedAt && query.cursorId
			? { createdAt: new Date(query.cursorCreatedAt as string), id: query.cursorId as string }
			: undefined;
	}

	listUsers = this.handle(async (req, res) => {
		const input: AdminUserListInput = {
			limit: req.query.limit as unknown as number,
			...(req.query.role ? { role: req.query.role as AdminUserListInput["role"] } : {}),
			...(req.query.status ? { status: req.query.status as AdminUserListInput["status"] } : {}),
			...(this.cursor(req.query) ? { cursor: this.cursor(req.query) } : {})
		};
		SuccessResponseHandler(res, await this.service.listUsers(this.actor(res), input));
	});

	getUser = this.handle(async (req, res) => {
		SuccessResponseHandler(res, await this.service.getUser(this.actor(res), req.params.userId as string));
	});

	changeRole = this.handle(async (req, res) => {
		SuccessResponseHandler(res, await this.service.changeRole(this.actor(res), req.params.userId as string, {
			role: req.body.role, expectedUpdatedAt: new Date(req.body.expectedUpdatedAt)
		}));
	});

	listAssignments = this.handle(async (req, res) => {
		const input: AssignmentListInput = {
			limit: req.query.limit as unknown as number,
			includeRevoked: req.query.includeRevoked as unknown as boolean,
			...(this.cursor(req.query) ? { cursor: this.cursor(req.query) } : {})
		};
		SuccessResponseHandler(res, await this.service.listAssignments(this.actor(res), req.params.userId as string, input));
	});

	assign = this.handle(async (req, res) => {
		SuccessResponseHandler(res, await this.service.assign(this.actor(res), req.params.userId as string,
			req.params.workId as string, { expectedVersion: req.body.expectedVersion }));
	});

	revoke = this.handle(async (req, res) => {
		SuccessResponseHandler(res, await this.service.revoke(this.actor(res), req.params.userId as string,
			req.params.workId as string, { expectedVersion: req.body.expectedVersion }));
	});
}
