import { Router } from "express";
import { AdminController } from "../controllers/auth/admin.controller";
import { validateAdminInput } from "../middlewares/admin-validation.middleware";
import { createAuthenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import {
	adminAssignmentParamsSchema, adminAssignmentsQuerySchema, adminAssignBodySchema,
	adminRevokeBodySchema, adminRoleBodySchema, adminUserParamsSchema, adminUsersQuerySchema
} from "../middlewares/schemas/admin.schema";
import { adminService, type AdminService } from "../services/auth/admin.service";
import { authService, type AuthService } from "../services/auth/auth.service";

type Service = Pick<AdminService, "listUsers" | "getUser" | "changeRole" | "listAssignments" | "assign" | "revoke">;

export function createAdminRouter(service: Service = adminService,
	auth: Pick<AuthService, "authenticateToken"> = authService): Router {
	const router = Router();
	const controller = new AdminController(service);
	const authenticate = createAuthenticate(auth);
	const adminOnly = authorize(["ADMIN"]);

	router.get("/admin/users", authenticate, adminOnly,
		validateAdminInput("query", adminUsersQuerySchema), controller.listUsers);
	router.get("/admin/users/:userId", authenticate, adminOnly,
		validateAdminInput("params", adminUserParamsSchema), controller.getUser);
	router.patch("/admin/users/:userId/role", authenticate, adminOnly,
		validateAdminInput("params", adminUserParamsSchema), validateAdminInput("body", adminRoleBodySchema), controller.changeRole);
	router.get("/admin/users/:userId/work-assignments", authenticate, adminOnly,
		validateAdminInput("params", adminUserParamsSchema), validateAdminInput("query", adminAssignmentsQuerySchema), controller.listAssignments);
	router.put("/admin/users/:userId/work-assignments/:workId", authenticate, adminOnly,
		validateAdminInput("params", adminAssignmentParamsSchema), validateAdminInput("body", adminAssignBodySchema), controller.assign);
	router.patch("/admin/users/:userId/work-assignments/:workId/revocation", authenticate, adminOnly,
		validateAdminInput("params", adminAssignmentParamsSchema), validateAdminInput("body", adminRevokeBodySchema), controller.revoke);

	return router;
}

export default createAdminRouter();
