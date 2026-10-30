import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" as const };
const userId = "22222222-2222-4222-8222-222222222222";
const sanctionId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";
const startsAt = new Date("2026-10-30T12:00:00.000Z");

describe("CommentSanctionService", () => {
	let Service: new (...args: any[]) => any;
	let repository: any;
	let evidence: any;
	let service: any;
	beforeEach(async () => {
		const modulePath = "../community/comment-sanction.service.js";
		Service = (await import(modulePath)).CommentSanctionService;
		repository = { list: vi.fn(), findCurrent: vi.fn(), impose: vi.fn(), revoke: vi.fn() };
		evidence = { findCommentEvidence: vi.fn(), findReportEvidence: vi.fn() };
		service = new Service(repository, evidence);
	});

	it("maps exact SQL-time expiry and does not require a cron closure", async () => {
		repository.findCurrent.mockResolvedValue({ now: new Date(+startsAt + 60_000), current: { id: sanctionId, userId, reason: "temporary", startsAt, endsAt: new Date(+startsAt + 60_000), imposedById: admin.id, evidence: null, revokedAt: null, revokedById: null, closedAt: null } });
		await expect(service.getOwnRestriction(userId)).resolves.toEqual({ active: false, reason: null, endsAt: null, permanent: false });
	});

	it("returns only private restriction fields to the affected account", async () => {
		repository.findCurrent.mockResolvedValue({ now: startsAt, current: { id: sanctionId, userId, reason: "private reason", startsAt, endsAt: null, imposedById: admin.id, evidence: { type: "COMMENT", id: evidenceId }, revokedAt: null, revokedById: null, closedAt: null } });
		const result = await service.getOwnRestriction(userId);
		expect(result).toEqual({ active: true, reason: "private reason", endsAt: null, permanent: true });
		expect(result).not.toHaveProperty("imposedById");
		expect(result).not.toHaveProperty("evidence");
		expect(result).not.toHaveProperty("history");
	});

	it("validates evidence existence and ownership before imposing", async () => {
		evidence.findCommentEvidence.mockResolvedValue({ reference: { type: "COMMENT", id: evidenceId }, authorId: userId });
		repository.impose.mockResolvedValue({ id: sanctionId, userId, reason: "spam", startsAt, endsAt: null, imposedById: admin.id, evidence: { type: "COMMENT", id: evidenceId }, revokedAt: null, revokedById: null, closedAt: null });
		await service.impose(admin, userId, { reason: "spam", endsAt: null, evidence: { type: "COMMENT", id: evidenceId } });
		expect(repository.impose).toHaveBeenCalledWith(admin, userId, expect.anything(), expect.objectContaining({ authorId: userId }));
		evidence.findCommentEvidence.mockResolvedValue({ reference: { type: "COMMENT", id: evidenceId }, authorId: admin.id });
		await expect(service.impose(admin, userId, { reason: "spam", endsAt: null, evidence: { type: "COMMENT", id: evidenceId } })).rejects.toMatchObject({ statusCode: 400 });
	});

	it("rejects ADMIN targets, self-sanction and invalid temporal input before persistence", async () => {
		for (const target of [{ id: userId, role: "ADMIN" }, { id: admin.id, role: "BASIC" }]) {
			await expect(service.impose(admin, target as any, { reason: "spam", endsAt: null })).rejects.toMatchObject({ statusCode: 403 });
		}
		await expect(service.impose(admin, { id: userId, role: "BASIC" }, { reason: " ", endsAt: null })).rejects.toMatchObject({ statusCode: 400 });
		expect(repository.impose).not.toHaveBeenCalled();
	});

	it("revokes the concrete historical UUID and never selects a newer sanction", async () => {
		repository.revoke.mockResolvedValue({ id: sanctionId, userId });
		await service.revoke(admin, userId, sanctionId);
		expect(repository.revoke).toHaveBeenCalledOnce();
		expect(repository.revoke).toHaveBeenCalledWith(admin, userId, sanctionId);
	});
});
