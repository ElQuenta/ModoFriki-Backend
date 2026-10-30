import { CommentRepository } from "../../repositories/community/comment.repository";
import { CommentReportRepository } from "../../repositories/community/comment-report.repository";
import { commentSanctionRepository } from "../../repositories/community/comment-sanction.repository";
import type { AdminActor, CursorPageInput } from "../../types/admin.types";
import type { ImposeSanctionInput, RestrictionDto, SanctionDto, SanctionHistoryDto, SanctionRecord, SanctionRepositoryContract, ValidatedSanctionEvidence } from "../../types/sanctions.types";
import AppError from "../../utils/AppError";

type EvidenceAccess = Pick<CommentRepository, "findCommentEvidence"> & Pick<CommentReportRepository, "findReportEvidence">;
const id = (value: string, name: string) => {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AppError(`Invalid ${name}`, 400);
	return value.toLowerCase();
};
function dto(record: SanctionRecord, now: Date): SanctionDto {
	const status = record.closedAt ? (record.revokedAt ? "REVOKED" : "EXPIRED") : "ACTIVE";
	return { id: record.id, userId: record.userId, reason: record.reason, startsAt: record.startsAt?.toISOString() ?? now.toISOString(), endsAt: record.endsAt?.toISOString() ?? null, permanent: record.endsAt === null, status, imposedById: record.imposedById, revokedAt: record.revokedAt?.toISOString() ?? null, revokedById: record.revokedById ?? null, evidence: record.evidence ?? null };
}

export class CommentSanctionService {
	constructor(private readonly repository: SanctionRepositoryContract = commentSanctionRepository, private readonly evidence?: EvidenceAccess) {}
	async getOwnRestriction(userId: string): Promise<RestrictionDto> {
		const { now, current } = await this.repository.findCurrent(id(userId, "userId"));
		if (!current || current.closedAt || (current.endsAt && current.endsAt <= now)) return { active: false, reason: null, endsAt: null, permanent: false };
		return current.endsAt === null ? { active: true, reason: current.reason, endsAt: null, permanent: true } : { active: true, reason: current.reason, endsAt: current.endsAt.toISOString(), permanent: false };
	}
	async list(actor: AdminActor, userId: string, input: CursorPageInput): Promise<SanctionHistoryDto> {
		const result = await this.repository.list(actor, id(userId, "userId"), input);
		return { current: result.current ? dto(result.current, result.now) : null, history: { items: result.history.items.map(row => dto(row, result.now)), hasMore: result.history.hasMore, nextCursor: result.history.nextCursor ? { createdAt: result.history.nextCursor.createdAt.toISOString(), id: result.history.nextCursor.id } : null } };
	}
	async impose(actor: AdminActor, target: { id: string; role: string } | string, input: ImposeSanctionInput): Promise<SanctionDto> {
		const targetUser = typeof target === "string" ? { id: target, role: "BASIC" } : target;
		const userId = id(targetUser.id, "userId");
		if (actor.id === userId || targetUser.role === "ADMIN") throw new AppError("Protected administrator", 403);
		const reason = input.reason?.trim(); if (!reason || reason.length > 2000 || (input.endsAt !== null && !(input.endsAt instanceof Date))) throw new AppError("Invalid sanction input", 400);
		let evidence: ValidatedSanctionEvidence | null = null;
		if (input.evidence) {
			if (!this.evidence) throw new AppError("Evidence verification unavailable", 503);
			evidence = input.evidence.type === "COMMENT" ? await this.evidence.findCommentEvidence(input.evidence.id) : await this.evidence.findReportEvidence(input.evidence.id);
			if (!evidence || evidence.authorId !== userId) throw new AppError("Evidence does not belong to the user", 400);
		}
		const row = await this.repository.impose(actor, userId, { ...input, reason }, evidence);
		return dto(row, new Date());
	}
	async revoke(actor: AdminActor, userId: string, sanctionId: string): Promise<SanctionDto> {
		const row = await this.repository.revoke(actor, id(userId, "userId"), id(sanctionId, "sanctionId"));
		return dto(row, new Date());
	}
}

const comments = new CommentRepository();
const reports = new CommentReportRepository();
export const commentSanctionService = new CommentSanctionService(commentSanctionRepository, {
	findCommentEvidence: (id) => comments.findCommentEvidence(id),
	findReportEvidence: (id) => reports.findReportEvidence(id)
});
