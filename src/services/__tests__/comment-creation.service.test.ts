import { describe, expect, it, vi } from "vitest";
import { CommentCreationService } from "../community/comment-creation.service";
import { persistenceOperation } from "../../repositories/community/community.persistence";

const actor = { id: "11111111-1111-4111-8111-111111111111", role: "BASIC" as const };
const operationId = "22222222-2222-4222-8222-222222222222";
const targetId = "33333333-3333-4333-8333-333333333333";

describe("committed comment recovery", () => {
	it.each(["root", "reply"])("replays a %s after edit or soft deletion without staging again", async kind => {
		for (const bodyMarkdown of ["edited", null]) {
			const record = { _id: operationId, authorId: actor.id, creationOperationId: operationId, bodyMarkdown };
			const decisions = { prepare: vi.fn().mockResolvedValue({ state: "COMMITTED" }), finalize: vi.fn() };
			const comments = { recoverCommitted: vi.fn().mockResolvedValue(record), stageRoot: vi.fn(), stageReply: vi.fn() };
			const service = new CommentCreationService(decisions as any, comments as any);
			const request = kind === "root" ? { targetType: "WORK" as const, targetId, bodyMarkdown: "original" } : { parentCommentId: targetId, bodyMarkdown: "original" };
			await expect(service.create(request, actor, operationId)).resolves.toBe(record);
			expect(comments.recoverCommitted).toHaveBeenCalledWith(operationId, actor.id);
			expect(comments.stageRoot).not.toHaveBeenCalled(); expect(comments.stageReply).not.toHaveBeenCalled();
			expect(decisions.finalize).not.toHaveBeenCalled();
		}
	});
	it("maps unknown Mongo driver failures to a safe retryable 503", async () => {
		const failure = new Error("private-driver-message");
		const promise = persistenceOperation(async () => { throw failure; });
		await expect(promise).rejects.toMatchObject({ statusCode: 503, message: "Community persistence unavailable" });
	});
});
