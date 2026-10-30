import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/auth/auth.repository", () => ({ authRepository: {} }));
vi.mock("../../repositories/community/catalog.repository", () => ({ catalogRepository: {} }));
vi.mock("../../repositories/community/comment.repository", () => ({ CommentRepository: class {} }));
vi.mock("../../repositories/community/comment-vote.repository", () => ({ CommentVoteRepository: class {} }));
vi.mock("../../repositories/community/comment-report.repository", () => ({ CommentReportRepository: class {} }));

import { CommunityService } from "../community/community.service";
import type { CommentRecord } from "../../models/community/community.types";
import type { AuthUser } from "../../types/express";
import AppError from "../../utils/AppError";

const authorId = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const otherId = "2c9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bee";
const adminId = "3d9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bef";
const workId = "4e9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bf0";
const commentId = "5f9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bf1";
const reportId = "6a9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bf2";
const author: AuthUser = { id: authorId, role: "BASIC" };
const other: AuthUser = { id: otherId, role: "BASIC" };
const editor: AuthUser = { id: otherId, role: "EDITOR" };
const admin: AuthUser = { id: adminId, role: "ADMIN" };
const now = new Date("2026-01-01T00:00:00.000Z");

const record = (overrides: Partial<CommentRecord> = {}): CommentRecord => ({
	_id: commentId, authorId, targetType: "WORK", targetId: workId, parentCommentId: null, rootCommentId: commentId,
	bodyMarkdown: "hola", status: "ACTIVE", revision: 0, createdAt: now, updatedAt: now, editedAt: null,
	deletedAt: null, deletedById: null, ...overrides
});

const report = {
	_id: reportId, commentId, reporterId: otherId, reason: "SPAM" as const, details: null, status: "OPEN" as const,
	createdAt: now, updatedAt: now, reviewedAt: null, reviewedById: null, resolution: null
};

const expectStatus = async (promise: Promise<unknown>, status: number) => {
	const error = await promise.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(AppError);
	expect((error as AppError).statusCode).toBe(status);
};

const fakes = () => ({
	comments: {
		createRoot: vi.fn(), createReply: vi.fn(), findById: vi.fn(), listRoots: vi.fn(), listReplies: vi.fn(),
		listThread: vi.fn(), editOwn: vi.fn(), softDeleteOwn: vi.fn(), softDeleteAsModerator: vi.fn()
	},
	votes: { setVote: vi.fn(), removeVote: vi.fn(), getSummaries: vi.fn().mockResolvedValue([]) },
	reports: { create: vi.fn(), listForModeration: vi.fn(), resolveAsModerator: vi.fn() },
	catalog: { findWork: vi.fn().mockResolvedValue({ id: workId }), findChapter: vi.fn().mockResolvedValue({ id: workId, workId }) },
		users: { findByIds: vi.fn().mockResolvedValue([{ id: authorId, username: "alan", status: "ACTIVE", deletedAt: null }]) },
		publication: { create: vi.fn().mockResolvedValue(record()) }
});

describe("CommunityService", () => {
	let f: ReturnType<typeof fakes>;
	let service: CommunityService;

	beforeEach(() => {
		f = fakes();
		service = new CommunityService(f.comments as never, f.votes as never, f.reports as never, f.catalog as never, f.users as never, f.publication as never);
	});

	it("allows a committed reply retry to reach recovery after its parent was soft deleted", async () => {
		f.comments.findById.mockResolvedValue(record({ status: "DELETED", bodyMarkdown: null }));
		await service.create({ parentCommentId: commentId, bodyMarkdown: "original" }, author, reportId);
		expect(f.publication.create).toHaveBeenCalledWith({ parentCommentId: commentId, bodyMarkdown: "original" }, author, reportId);
	});

	describe("list", () => {
		const emptyPage = { items: [], hasMore: false, nextCursor: null };

		it("lista raíces de un destino publicado", async () => {
			f.comments.listRoots.mockResolvedValue(emptyPage);
			await expect(service.list({ targetType: "WORK", targetId: workId })).resolves.toEqual(emptyPage);
			expect(f.comments.listRoots).toHaveBeenCalledWith({ limit: 20, targetType: "WORK", targetId: workId });
		});

		it("ningún selector, dos selectores o claves desconocidas → 400", async () => {
			await expectStatus(service.list({}), 400);
			await expectStatus(service.list({ targetType: "WORK", targetId: workId, parentCommentId: commentId }), 400);
			await expectStatus(service.list({ parentCommentId: commentId, rootCommentId: commentId }), 400);
			await expectStatus(service.list({ targetType: "WORK", targetId: workId, foo: 1 }), 400);
			await expectStatus(service.list({ targetType: "USER", targetId: workId }), 400);
			await expectStatus(service.list(null), 400);
		});

		it("limit fuera de 1..100 o cursor incompleto → 400", async () => {
			await expectStatus(service.list({ targetType: "WORK", targetId: workId, limit: "101" }), 400);
			await expectStatus(service.list({ targetType: "WORK", targetId: workId, limit: "0" }), 400);
			await expectStatus(service.list({ targetType: "WORK", targetId: workId, cursorId: commentId }), 400);
			expect(f.comments.listRoots).not.toHaveBeenCalled();
		});

		it("destino no publicado → 404", async () => {
			f.catalog.findWork.mockResolvedValue(null);
			await expectStatus(service.list({ targetType: "WORK", targetId: workId }), 404);
			f.catalog.findChapter.mockResolvedValue(null);
			await expectStatus(service.list({ targetType: "CHAPTER", targetId: workId }), 404);
		});

		it("rootCommentId que no es raíz → 400", async () => {
			f.comments.findById.mockResolvedValue(record({ parentCommentId: otherId, rootCommentId: otherId }));
			await expectStatus(service.list({ rootCommentId: commentId }), 400);
		});

		it("comentario DELETED expone bodyMarkdown null", async () => {
			f.comments.listRoots.mockResolvedValue({ items: [record({ status: "DELETED" })], hasMore: false, nextCursor: null });
			const page = await service.list({ targetType: "WORK", targetId: workId });
			expect(page.items[0].bodyMarkdown).toBeNull();
			expect(page.items[0].author).toEqual({ id: authorId, username: "alan" });
		});
	});

	describe("create", () => {
		it("usa el id del usuario autenticado como authorId", async () => {
			f.publication.create.mockResolvedValue(record());
			await service.create({ targetType: "WORK", targetId: workId, bodyMarkdown: "hola" }, author);
			expect(f.publication.create).toHaveBeenCalledWith({ targetType: "WORK", targetId: workId, bodyMarkdown: "hola" }, author, undefined);
		});

		it("rechaza authorId en el body → 400", async () => {
			await expectStatus(service.create({ targetType: "WORK", targetId: workId, bodyMarkdown: "x", authorId: otherId }, author), 400);
		});

		it("destino no publicado → 404", async () => {
			f.catalog.findWork.mockResolvedValue(null);
			await expectStatus(service.create({ targetType: "WORK", targetId: workId, bodyMarkdown: "hola" }, author), 404);
			expect(f.comments.createRoot).not.toHaveBeenCalled();
		});

		it("responder a comentario DELETED → 404", async () => {
			f.comments.findById.mockResolvedValue(record({ status: "DELETED" }));
			await expectStatus(service.create({ parentCommentId: commentId, bodyMarkdown: "hola" }, author), 404);
		});

		it("respuesta con destino explícito → 400", async () => {
			await expectStatus(service.create({ parentCommentId: commentId, targetType: "WORK", bodyMarkdown: "hola" }, author), 400);
		});

		it("cuerpo vacío → 400; sin actor → 401", async () => {
			await expectStatus(service.create({ targetType: "WORK", targetId: workId, bodyMarkdown: "   " }, author), 400);
			await expectStatus(service.create({ targetType: "WORK", targetId: workId, bodyMarkdown: "hola" }, undefined as never), 401);
		});
	});

	describe("edit", () => {
		it("el autor edita con expectedRevision", async () => {
			f.comments.findById.mockResolvedValue(record());
			f.comments.editOwn.mockResolvedValue(record({ bodyMarkdown: "nuevo", revision: 1 }));
			const dto = await service.edit(commentId, { bodyMarkdown: "nuevo", expectedRevision: 0 }, author);
			expect(dto.revision).toBe(1);
			expect(f.comments.editOwn).toHaveBeenCalledWith({ commentId, authorId, bodyMarkdown: "nuevo", expectedRevision: 0 });
		});

		it("editar comentario ajeno → 403 (IDOR), incluso siendo ADMIN", async () => {
			f.comments.findById.mockResolvedValue(record());
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x", expectedRevision: 0 }, other), 403);
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x", expectedRevision: 0 }, admin), 403);
			expect(f.comments.editOwn).not.toHaveBeenCalled();
		});

		it("expectedRevision obsoleta → 409", async () => {
			f.comments.findById.mockResolvedValue(record({ revision: 3 }));
			f.comments.editOwn.mockRejectedValue(new AppError("Comment unavailable for editing or revision changed", 409));
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x", expectedRevision: 1 }, author), 409);
		});

		it("expectedRevision ausente o inválida → 400", async () => {
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x" }, author), 400);
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x", expectedRevision: -1 }, author), 400);
		});

		it("comentario DELETED no editable → 404", async () => {
			f.comments.findById.mockResolvedValue(record({ status: "DELETED" }));
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x", expectedRevision: 0 }, author), 404);
		});

		it("comentario inexistente → 404; id inválido → 400", async () => {
			f.comments.findById.mockResolvedValue(null);
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x", expectedRevision: 0 }, author), 404);
			await expectStatus(service.edit("no-uuid", { bodyMarkdown: "x", expectedRevision: 0 }, author), 400);
		});

		it("comentario en destino ya no publicado → 404", async () => {
			f.comments.findById.mockResolvedValue(record());
			f.catalog.findWork.mockResolvedValue(null);
			await expectStatus(service.edit(commentId, { bodyMarkdown: "x", expectedRevision: 0 }, author), 404);
		});
	});

	describe("remove", () => {
		it("el autor borra su comentario", async () => {
			f.comments.findById.mockResolvedValue(record());
			await service.remove(commentId, author);
			expect(f.comments.softDeleteOwn).toHaveBeenCalledWith({ commentId, authorId });
			expect(f.comments.softDeleteAsModerator).not.toHaveBeenCalled();
		});

		it("borrar ajeno sin ser ADMIN → 403 (BASIC y EDITOR)", async () => {
			f.comments.findById.mockResolvedValue(record());
			await expectStatus(service.remove(commentId, other), 403);
			await expectStatus(service.remove(commentId, editor), 403);
			expect(f.comments.softDeleteOwn).not.toHaveBeenCalled();
			expect(f.comments.softDeleteAsModerator).not.toHaveBeenCalled();
		});

		it("ADMIN borra comentario ajeno como moderador", async () => {
			f.comments.findById.mockResolvedValue(record());
			await service.remove(commentId, admin);
			expect(f.comments.softDeleteAsModerator).toHaveBeenCalledWith({ commentId, moderatorId: adminId });
		});

		it("autor borra aunque el destino ya no esté publicado", async () => {
			f.comments.findById.mockResolvedValue(record());
			f.catalog.findWork.mockResolvedValue(null);
			await service.remove(commentId, author);
			expect(f.comments.softDeleteOwn).toHaveBeenCalled();
		});

		it("comentario ya DELETED → 404", async () => {
			f.comments.findById.mockResolvedValue(record({ status: "DELETED" }));
			await expectStatus(service.remove(commentId, author), 404);
		});
	});

	describe("votos", () => {
		it("vota con el usuario autenticado y devuelve el resumen", async () => {
			f.comments.findById.mockResolvedValue(record());
			f.votes.getSummaries.mockResolvedValue([{ commentId, upvotes: 1, downvotes: 0, score: 1 }]);
			await expect(service.setVote(commentId, { value: 1 }, other)).resolves.toEqual({ commentId, upvotes: 1, downvotes: 0, score: 1 });
			expect(f.votes.setVote).toHaveBeenCalledWith({ commentId, userId: otherId, value: 1 });
		});

		it("valor distinto de 1/-1 o userId en el body → 400", async () => {
			await expectStatus(service.setVote(commentId, { value: 2 }, other), 400);
			await expectStatus(service.setVote(commentId, { value: "1" }, other), 400);
			await expectStatus(service.setVote(commentId, { value: 1, userId: authorId }, other), 400);
			expect(f.votes.setVote).not.toHaveBeenCalled();
		});

		it("comentario DELETED no votable → 404", async () => {
			f.comments.findById.mockResolvedValue(record({ status: "DELETED" }));
			await expectStatus(service.setVote(commentId, { value: 1 }, other), 404);
			expect(f.votes.setVote).not.toHaveBeenCalled();
		});

		it("comentario en destino no publicado → 404", async () => {
			f.comments.findById.mockResolvedValue(record());
			f.catalog.findWork.mockResolvedValue(null);
			await expectStatus(service.setVote(commentId, { value: -1 }, other), 404);
		});

		it("retirar voto usa el usuario autenticado", async () => {
			f.comments.findById.mockResolvedValue(record());
			await service.removeVote(commentId, other);
			expect(f.votes.removeVote).toHaveBeenCalledWith({ commentId, userId: otherId });
		});
	});

	describe("reportes", () => {
		it("crea reporte con reporterId del usuario autenticado", async () => {
			f.comments.findById.mockResolvedValue(record());
			f.reports.create.mockResolvedValue(report);
			await expect(service.report(commentId, { reason: "SPAM" }, other)).resolves.toEqual({
				id: reportId, commentId, reason: "SPAM", details: null, status: "OPEN", createdAt: now.toISOString()
			});
			expect(f.reports.create).toHaveBeenCalledWith({ commentId, reporterId: otherId, reason: "SPAM", details: undefined });
		});

		it("reporte duplicado → 409", async () => {
			f.comments.findById.mockResolvedValue(record());
			f.reports.create.mockRejectedValue(new AppError("Community record already exists", 409));
			await expectStatus(service.report(commentId, { reason: "SPAM" }, other), 409);
		});

		it("motivo inválido → 400; comentario DELETED → 404", async () => {
			await expectStatus(service.report(commentId, { reason: "BORING" }, other), 400);
			f.comments.findById.mockResolvedValue(record({ status: "DELETED" }));
			await expectStatus(service.report(commentId, { reason: "SPAM" }, other), 404);
		});

		it("moderación de reportes solo ADMIN → 403", async () => {
			await expectStatus(service.listReports({}, other), 403);
			await expectStatus(service.resolveReport(reportId, { status: "RESOLVED", resolution: "ok" }, editor), 403);
			expect(f.reports.listForModeration).not.toHaveBeenCalled();
			expect(f.reports.resolveAsModerator).not.toHaveBeenCalled();
		});

		it("ADMIN resuelve con su id como moderador; estado OPEN no permitido → 400", async () => {
			f.reports.resolveAsModerator.mockResolvedValue({ ...report, status: "RESOLVED", reviewedById: adminId, reviewedAt: now, resolution: "ok" });
			const dto = await service.resolveReport(reportId, { status: "RESOLVED", resolution: "ok" }, admin);
			expect(dto.reviewedById).toBe(adminId);
			expect(f.reports.resolveAsModerator).toHaveBeenCalledWith({ reportId, moderatorId: adminId, status: "RESOLVED", resolution: "ok" });
			await expectStatus(service.resolveReport(reportId, { status: "OPEN", resolution: "ok" }, admin), 400);
		});
	});
});
