import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openIntegrationClients } from "../../__tests__/helpers/integration";

const total = 10_000;
const batchSize = 500;
const run = randomUUID().replace(/-/g, "");
const ids = Array.from({ length: total }, () => randomUUID());

describe("comment decision query scale", () => {
	let prisma: any;
	let close: () => Promise<void>;
	beforeAll(async () => ({ prisma, close } = await openIntegrationClients()));
	afterAll(async () => {
		if (prisma) {
			await prisma.commentCreationDecision.deleteMany({ where: { authorId: { in: ids } } });
			await prisma.user.deleteMany({ where: { id: { in: ids } } });
		}
		await close?.();
	});

	it("loads 10,000 accounts and decisions in bounded batches without an N+1 read", { timeout: 90_000 }, async () => {
		for (let start = 0; start < total; start += batchSize) {
			const chunk = ids.slice(start, start + batchSize);
			await prisma.user.createMany({ data: chunk.map((id, index) => ({ id, email: `${run}-${start + index}@scale.test`, emailNormalized: `${run}-${start + index}@scale.test`, username: `scale_${run.slice(0, 12)}_${start + index}`, usernameNormalized: `scale_${run.slice(0, 12)}_${start + index}`, passwordHash: "test-only", role: "BASIC", status: "ACTIVE" })) });
			const preparedAt = new Date(); const expiresAt = new Date(preparedAt.getTime() + 60_000);
			await prisma.commentCreationDecision.createMany({ data: chunk.map(id => ({ id, authorId: id, state: "PREPARED", requestFingerprint: "a".repeat(64), preparedAt, expiresAt })) });
		}

		const [accounts, decisions] = await Promise.all([
			prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true }, take: 100, orderBy: { id: "asc" } }),
			prisma.commentCreationDecision.findMany({ where: { authorId: { in: ids }, state: "PREPARED" }, select: { id: true, authorId: true }, take: 100, orderBy: { id: "asc" } })
		]);
		expect(accounts).toHaveLength(100);
		expect(decisions).toHaveLength(100);
	});
});
