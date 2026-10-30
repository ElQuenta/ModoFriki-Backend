import type { Prisma } from "../generated/prisma/client";
import AppError from "../utils/AppError";

export const ADMIN_TRANSACTION_OPTIONS = { maxWait: 2000, timeout: 5000 } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Use inside the caller's existing transaction, before Work/auxiliary locks.
 * Pass every actor/subject UUID in one call. No transaction, pool or remote IO here.
 * Missing accounts are checked by the caller after locks; errors propagate to its boundary.
 * The returned clock is read after every lock wait, unlike transaction-start now().
 * If the caller subsequently waits for Work locks, readSqlTime again after those locks.
 */
export async function lockUsers(tx: Prisma.TransactionClient, userIds: readonly string[]): Promise<Date> {
	if (userIds.some(id => !uuid.test(id))) throw new AppError("Invalid user identifier", 400);
	const ids = [...new Set(userIds.map(id => id.toLowerCase()))].sort();
	for (const id of ids) {
		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id}::uuid FOR UPDATE`;
	}
	return readSqlTime(tx);
}

export async function readSqlTime(tx: Prisma.TransactionClient): Promise<Date> {
	// Prisma's pg adapter can decode timestamptz using the server's local offset. Format an
	// explicit UTC instant at the SQL boundary so lock/expiry comparisons stay authoritative.
	const rows = await tx.$queryRaw<{ nowText?: string; now?: Date }[]>`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "nowText"`;
	const raw = rows[0];
	// Keep the transaction helper mockable without accepting an invalid provider value.
	const now = raw?.now instanceof Date ? raw.now : new Date(raw?.nowText ?? "");
	if (!Number.isFinite(now.getTime())) throw new AppError("Database clock unavailable", 503);
	return now;
}
