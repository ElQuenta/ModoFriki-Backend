import express, { type ErrorRequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHttpServer } from "../../__tests__/helpers/http";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { CommentRepository } from "../../repositories/community/comment.repository";
import { CommentReportRepository } from "../../repositories/community/comment-report.repository";
import { commentSanctionRepository } from "../../repositories/community/comment-sanction.repository";
import { createCommentSanctionsRouter } from "../comment-sanctions.routes";
import AppError from "../../utils/AppError";

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" as const };
const userId = "22222222-2222-4222-8222-222222222222";
const evidenceId = "44444444-4444-4444-8444-444444444444";

describe("production sanction evidence wiring", () => {
	let server: Awaited<ReturnType<typeof startHttpServer>>;
	afterEach(async () => { await server?.close(); vi.restoreAllMocks(); });
	async function request(type: "COMMENT" | "REPORT") {
		const app = express(); app.use(express.json());
		// Keep the production service and repository adapters; replace only authentication and I/O.
		app.use("/api", createCommentSanctionsRouter(undefined, { authenticateToken: vi.fn().mockResolvedValue(admin) }));
		const errors: ErrorRequestHandler = (error, _req, res, _next) => ErrorResponseHandler(res, error);
		app.use(errors); server = await startHttpServer(app);
		return server.request(`/api/admin/users/${userId}/comment-sanctions`, {
			method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" },
			body: JSON.stringify({ reason: "spam", endsAt: null, evidence: { type, id: evidenceId } })
		});
	}
	it.each(["COMMENT", "REPORT"] as const)("resolves %s evidence through the production service", async type => {
		const evidence = { reference: { type, id: evidenceId }, authorId: userId };
		const lookup = type === "COMMENT"
			? vi.spyOn(CommentRepository.prototype, "findCommentEvidence").mockResolvedValue(evidence)
			: vi.spyOn(CommentReportRepository.prototype, "findReportEvidence").mockResolvedValue(evidence);
		const impose = vi.spyOn(commentSanctionRepository, "impose").mockResolvedValue({
			id: evidenceId, userId, imposedById: admin.id, reason: "spam", startsAt: new Date(), endsAt: null,
			revokedAt: null, revokedById: null, closedAt: null, evidence: evidence.reference
		});
		const response = await request(type);
		expect(response.status).toBe(201);
		expect(lookup).toHaveBeenCalledWith(evidenceId);
		expect(impose).toHaveBeenCalledWith(admin, userId, expect.anything(), evidence);
	});
	it.each(["missing", "foreign", "unavailable"])("fails closed for %s evidence", async outcome => {
		const lookup = vi.spyOn(CommentRepository.prototype, "findCommentEvidence");
		if (outcome === "unavailable") lookup.mockRejectedValue(new AppError("Dependency unavailable", 503));
		else lookup.mockResolvedValue(outcome === "missing" ? null : { reference: { type: "COMMENT", id: evidenceId }, authorId: admin.id });
		const impose = vi.spyOn(commentSanctionRepository, "impose");
		const response = await request("COMMENT");
		expect(response.status).toBe(outcome === "unavailable" ? 503 : 400);
		expect(impose).not.toHaveBeenCalled();
	});
});
