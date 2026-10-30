import { describe, expectTypeOf, it } from "vitest";
import type { AdminUserDto, AdminUserRecord, ManagedRole, AssignmentDto } from "../admin.types";
import type { RestrictionDto, SanctionDto, SanctionRecord } from "../sanctions.types";
import type { CommentCreationDecision, CommentRejectionCode } from "../comment-creation.types";

describe("administrative compile-time contracts", () => {
	it("allowlists user fields and separates SQL dates from HTTP instants", () => {
		expectTypeOf<keyof AdminUserDto>().toEqualTypeOf<"id" | "username" | "role" | "status" | "createdAt" | "updatedAt">();
		expectTypeOf<AdminUserDto["updatedAt"]>().toEqualTypeOf<string>();
		expectTypeOf<AdminUserRecord["updatedAt"]>().toEqualTypeOf<Date>();
		expectTypeOf<ManagedRole>().toEqualTypeOf<"BASIC" | "EDITOR">();
		expectTypeOf<AssignmentDto["revokedAt"]>().toEqualTypeOf<string | null>();
	});
	it("excludes internal closure and actor/evidence from the own restriction view", () => {
		expectTypeOf<Extract<keyof SanctionDto, "closedAt">>().toEqualTypeOf<never>();
		expectTypeOf<keyof RestrictionDto>().toEqualTypeOf<"active" | "reason" | "endsAt" | "permanent">();
		expectTypeOf<Extract<SanctionRecord, { revokedAt: Date }>["revokedById"]>().toEqualTypeOf<string>();
	});
	it("makes terminal decision data explicit without a SQL comment body or target", () => {
		expectTypeOf<Extract<CommentCreationDecision, { state: "PREPARED" }>["decidedAt"]>().toEqualTypeOf<null>();
		expectTypeOf<Extract<CommentCreationDecision, { state: "REJECTED" }>["rejectionCode"]>().toEqualTypeOf<CommentRejectionCode>();
		expectTypeOf<Extract<CommentCreationDecision, { state: "COMMITTED" }>["rejectionCode"]>().toEqualTypeOf<null>();
		expectTypeOf<Extract<keyof CommentCreationDecision, "bodyMarkdown" | "targetId">>().toEqualTypeOf<never>();
	});
});
