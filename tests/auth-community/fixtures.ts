import "./setup";
import type { UserRecord } from "../../src/types/auth.types";
import type { CommentRecord, CommentReportRecord } from "../../src/models/community/community.types";
import { CommunityService } from "../../src/services/community/community.service";
import { ids, comment } from "../community/fakes";

export { ids };
export const actor = { id: ids.author, role: "BASIC" as const };
export const admin = { id: ids.other, role: "ADMIN" as const };
export function user(overrides: Partial<UserRecord> = {}): UserRecord {
	return { id: ids.author, email: "Reader@example.com", emailNormalized: "reader@example.com",
		username: "Reader", usernameNormalized: "reader", passwordHash: "secret-hash", role: "BASIC",
		status: "ACTIVE", timezone: "America/La_Paz", createdAt: new Date("2026-10-19T12:00:00Z"),
		updatedAt: new Date("2026-10-19T12:00:00Z"), deletedAt: null, ...overrides };
}
export function record(overrides: Partial<CommentRecord> = {}): CommentRecord {
	return comment(overrides) as CommentRecord;
}
export function reportRecord(overrides: Partial<CommentReportRecord> = {}): CommentReportRecord {
	return { _id: ids.report, commentId: ids.root, reporterId: ids.author, reason: "SPAM", details: null,
		status: "OPEN", createdAt: new Date(), updatedAt: new Date(), reviewedAt: null,
		reviewedById: null, resolution: null, ...overrides };
}
export function communityFixture() {
	const calls: Array<{ method: string; input: unknown }> = [];
	const state = { comment: record(), authors: [user()], published: true };
	const capture = (method: string, input: unknown) => { calls.push({ method, input }); };
	const page = () => ({ items: [state.comment], hasMore: false, nextCursor: null });
	const comments: ConstructorParameters<typeof CommunityService>[0] = {
		findById: async (id) => { capture("findById", id); return state.comment; },
		createRoot: async (input) => { capture("createRoot", input); return state.comment; },
		createReply: async (input) => { capture("createReply", input); return state.comment; },
		listRoots: async (input) => { capture("listRoots", input); return page(); },
		listReplies: async (input) => { capture("listReplies", input); return page(); },
		listThread: async (input) => { capture("listThread", input); return page(); },
		editOwn: async (input) => { capture("editOwn", input); return { ...state.comment, bodyMarkdown: input.bodyMarkdown, revision: input.expectedRevision + 1 }; },
		softDeleteOwn: async (input) => { capture("softDeleteOwn", input); return state.comment; },
		softDeleteAsModerator: async (input) => { capture("softDeleteAsModerator", input); return state.comment; }
	};
	const votes: ConstructorParameters<typeof CommunityService>[1] = {
		setVote: async (input) => { capture("setVote", input); return { _id: ids.third, ...input, createdAt: new Date(), updatedAt: new Date() }; },
		removeVote: async (input) => { capture("removeVote", input); return false; },
		getSummaries: async (input) => { capture("getSummaries", input); return input.map((commentId) => ({ commentId, upvotes: 2, downvotes: 1, score: 1 })); }
	};
	const reports: ConstructorParameters<typeof CommunityService>[2] = {
		create: async (input) => { capture("report", input); return reportRecord(); },
		listForModeration: async (input) => { capture("listReports", input); return { items: [reportRecord()], hasMore: false, nextCursor: null }; },
		resolveAsModerator: async (input) => { capture("resolve", input); return reportRecord(input); }
	};
	const catalog = { findWork: async () => state.published ? { id: ids.work } : null,
		findChapter: async () => state.published ? { id: ids.work, workId: ids.work } : null };
	const users = { findByIds: async (input: string[]) => { capture("authors", input); return state.authors; } };
	return { service: new CommunityService(comments, votes, reports, catalog, users), calls, state, comments };
}
