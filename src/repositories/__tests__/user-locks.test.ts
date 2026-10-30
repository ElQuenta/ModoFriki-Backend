import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/prisma/client";
import { lockUsers } from "../user-locks";

const first = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const second = "2c9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bee";
const now = new Date("2026-10-30T12:00:00.123Z");

describe("lockUsers", () => {
	it("deduplicates normalized UUIDs and locks sequentially before reading SQL time", async () => {
		const calls: { sql: string; values: unknown[] }[] = [];
		let outstanding = 0;
		const query = vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
			expect(outstanding++).toBe(0);
			calls.push({ sql: parts.join("?"), values });
			await Promise.resolve();
			outstanding--;
			return values.length ? [] : [{ now }];
		});
		const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
		expect(await lockUsers(tx, [second, first.toUpperCase(), first])).toEqual(now);
		expect(calls.map(call => call.values)).toEqual([[first], [second], []]);
		expect(calls[0].sql).toContain('FROM "User"');
		expect(calls[0].sql).toContain("FOR UPDATE");
		expect(calls[0].sql).not.toContain(first);
		expect(calls[2].sql).toContain("clock_timestamp()");
		expect(calls[2].sql).not.toContain("CURRENT_TIMESTAMP");
	});

	it("does not read time or continue after a lock failure", async () => {
		const error = new Error("transaction timed out");
		const query = vi.fn().mockRejectedValue(error);
		await expect(lockUsers({ $queryRaw: query } as unknown as Prisma.TransactionClient, [first, second])).rejects.toBe(error);
		expect(query).toHaveBeenCalledTimes(1);
	});

	it("validates the entire list before taking any lock", async () => {
		const query = vi.fn();
		await expect(lockUsers({ $queryRaw: query } as unknown as Prisma.TransactionClient, [first, "' OR 1=1"])).rejects.toMatchObject({ statusCode: 400 });
		expect(query).not.toHaveBeenCalled();
	});

	it("reads server time for an empty lock list and fails closed on an invalid clock result", async () => {
		const query = vi.fn().mockResolvedValueOnce([{ now }]).mockResolvedValueOnce([]);
		const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
		expect(await lockUsers(tx, [])).toEqual(now);
		await expect(lockUsers(tx, [])).rejects.toMatchObject({ statusCode: 503 });
	});
});
