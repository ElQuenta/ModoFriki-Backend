import type { ClientSession } from "mongoose";
import type { CommunityDependencies } from "../../src/repositories/community/community.persistence";

export const ids = {
	author: "10000000-0000-4000-8000-000000000001",
	other: "10000000-0000-4000-8000-000000000002",
	work: "20000000-0000-4000-8000-000000000001",
	root: "30000000-0000-4000-8000-000000000001",
	reply: "30000000-0000-4000-8000-000000000002",
	third: "30000000-0000-4000-8000-000000000003",
	report: "40000000-0000-4000-8000-000000000001"
};

export interface Call { method: string; args: unknown[] }

/** Records the query contract without evaluating Mongo filters or emulating a database. */
export class ModelDouble {
	readonly calls: Call[] = [];
	readonly results = new Map<string, unknown[]>();
	onCall?: (method: string) => void;

	respond(method: string, ...values: unknown[]) {
		this.results.set(method, values);
		return this;
	}

	private take(method: string): unknown {
		const queue = this.results.get(method);
		if (!queue?.length) throw new Error(`Unconfigured fake: ${method}`);
		const result = queue.shift();
		if (result instanceof Error) throw result;
		return result;
	}

	private record(method: string, args: unknown[]) {
		this.calls.push({ method, args });
		this.onCall?.(method);
	}

	private query(method: string, args: unknown[]) {
		this.record(method, args);
		const query = {
			sort: (...args: unknown[]) => { this.record("sort", args); return query; },
			limit: (...args: unknown[]) => { this.record("limit", args); return query; },
			lean: () => { this.record("lean", []); return query; },
			exec: async () => this.take(method)
		};
		return query;
	}

	find(...args: unknown[]) { return this.query("find", args); }
	findById(...args: unknown[]) { return this.query("findById", args); }
	findOneAndUpdate(...args: unknown[]) { return this.query("findOneAndUpdate", args); }
	deleteOne(...args: unknown[]) { return this.query("deleteOne", args); }
	aggregate(...args: unknown[]) { return this.query("aggregate", args); }
	async create(...args: unknown[]) {
		this.record("create", args);
		if (this.results.has("create")) this.take("create");
		const wrap = (value: unknown) => ({ toObject: () => value });
		return Array.isArray(args[0]) ? args[0].map(wrap) : wrap(args[0]);
	}

	args(method: string, occurrence = 0): unknown[] {
		const call = this.calls.filter((entry) => entry.method === method)[occurrence];
		if (!call) throw new Error(`Missing call: ${method}`);
		return call.args;
	}
}

export function fixture() {
	const comments = new ModelDouble();
	const votes = new ModelDouble();
	const reports = new ModelDouble();
	const lifecycle: string[] = [];
	const session = {
		withTransaction: async (operation: () => Promise<unknown>) => {
			lifecycle.push("transaction");
			try {
				const result = await operation();
				lifecycle.push("commit");
				return result;
			} catch (error) {
				lifecycle.push("abort");
				throw error;
			}
		},
		endSession: async () => { lifecycle.push("end"); }
	} as unknown as ClientSession;
	const dependencies = {
		comments, votes, reports,
		startSession: async () => { lifecycle.push("start"); return session; }
	} as unknown as CommunityDependencies;
	return { comments, votes, reports, lifecycle, session, dependencies };
}

export function comment(overrides: Record<string, unknown> = {}) {
	return {
		_id: ids.root, authorId: ids.author, targetType: "WORK", targetId: ids.work,
		parentCommentId: null, rootCommentId: ids.root, bodyMarkdown: "**Hello** ||spoiler||",
		status: "ACTIVE", revision: 0,
		createdAt: new Date("2026-10-19T12:00:00Z"), updatedAt: new Date("2026-10-19T12:00:00Z"),
		editedAt: null, deletedAt: null, deletedById: null, ...overrides
	};
}
