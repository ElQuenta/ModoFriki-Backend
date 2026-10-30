import type { AdminActor, CursorPage, CursorPageInput, CursorPageRecord } from "./admin.types";

export type SanctionEvidence = { type: "COMMENT" | "REPORT"; id: string };
/** Produced by the evidence repository, not trusted client metadata. */
export interface ValidatedSanctionEvidence { reference: SanctionEvidence; authorId: string }
export interface ImposeSanctionInput { reason: string; endsAt: Date | null; evidence?: SanctionEvidence }
export type SanctionStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

interface SanctionRecordBase {
	id: string;
	userId: string;
	reason: string;
	startsAt: Date;
	endsAt: Date | null;
	imposedById: string;
	evidence: SanctionEvidence | null;
}
/** Mirrors the model's exhaustive open/revoked/expired closure combinations. */
export type SanctionRecord = SanctionRecordBase & (
	| { revokedAt: null; revokedById: null; closedAt: null }
	| { revokedAt: Date; revokedById: string; closedAt: Date }
	| { revokedAt: null; revokedById: null; closedAt: Date; endsAt: Date }
);
export interface SanctionDto {
	id: string;
	userId: string;
	reason: string;
	startsAt: string;
	endsAt: string | null;
	permanent: boolean;
	status: SanctionStatus;
	imposedById: string;
	revokedAt: string | null;
	revokedById: string | null;
	evidence: SanctionEvidence | null;
}
export type RestrictionDto =
	| { active: false; reason: null; endsAt: null; permanent: false }
	| { active: true; reason: string; endsAt: null; permanent: true }
	| { active: true; reason: string; endsAt: string; permanent: false };
export interface SanctionHistoryDto { current: SanctionDto | null; history: CursorPage<SanctionDto> }
/** SQL time accompanies records so services calculate expiry from the same authority. */
export interface SanctionHistoryRecord {
	now: Date;
	current: SanctionRecord | null;
	history: CursorPageRecord<SanctionRecord>;
}
export interface SanctionRepositoryContract {
	/** History sorts startsAt DESC/id DESC; cursor.createdAt represents startsAt. */
	list(actor: AdminActor, userId: string, input: CursorPageInput): Promise<SanctionHistoryRecord>;
	findCurrent(userId: string): Promise<{ now: Date; current: SanctionRecord | null }>;
	/** Atomic sanction + audit + rejection of every pending creation under User locks. */
	impose(actor: AdminActor, userId: string, input: ImposeSanctionInput, evidence: ValidatedSanctionEvidence | null): Promise<SanctionRecord>;
	/** Identifies one sanction; a replay can never revoke a later one. */
	revoke(actor: AdminActor, userId: string, sanctionId: string): Promise<SanctionRecord>;
}
