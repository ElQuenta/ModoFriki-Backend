import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openIntegrationClients } from "./helpers/integration";

/** Read-only provider preflight; no migration, seed, or fixture persistence. */
describe("disposable provider environment", () => {
	let clients: Awaited<ReturnType<typeof openIntegrationClients>>;
	beforeAll(async () => { clients = await openIntegrationClients(); });
	afterAll(async () => { if (clients) await clients.close(); });
	it("reads SQL server time and a writable Mongo replica set", async () => {
		const rows = await clients.prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
		expect(rows[0].now).toBeInstanceOf(Date);
		const hello = await clients.mongoose.connection.db!.admin().command({ hello: 1 });
		expect(hello.setName).toBeTruthy();
		expect(hello.isWritablePrimary).toBe(true);
	});
});
