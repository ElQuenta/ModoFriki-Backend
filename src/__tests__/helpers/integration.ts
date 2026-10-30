import { integrationEnvironment } from "../../../test-support/integration-environment";
export { createBarrier, createFixtureScope } from "./fixtures";

/** Import only from *.integration.test.ts; clients load after destination validation. */
export async function openIntegrationClients() {
	const env = integrationEnvironment(process.env);
	if (process.env.DATABASE_URL !== env.DATABASE_URL || process.env.MONGODB_URI !== env.MONGODB_URI || process.env.NODE_ENV !== "test") {
		throw new Error("Integration config must set verified test destinations before importing clients");
	}
	const { prisma, mongoose, config } = await import("./integration-clients.js");
	if (config.db.postgresUrl !== env.DATABASE_URL || config.db.mongoUrl !== env.MONGODB_URI
		|| config.nodeEnv !== "test" || mongoose.connection.readyState !== 0) {
		throw new Error("Integration clients were already configured or connected outside this test scope");
	}
	const close = async () => {
		const results = await Promise.allSettled([prisma.$disconnect(), mongoose.disconnect()]);
		if (results.some(result => result.status === "rejected")) throw new Error("Unable to close integration clients");
	};
	try {
		await prisma.$connect();
		await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
		const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
		if (!hello.setName || !hello.isWritablePrimary) throw new Error("A writable Mongo replica set is required");
		return { prisma, mongoose, close };
	} catch {
		await close();
		throw new Error("Disposable SQL/Mongo replica set integration clients are unavailable");
	}
}
