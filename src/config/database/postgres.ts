import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import config from "../env";
import { createLogger } from "../../utils/logger";
import { safeErrorMessage, uriHost } from "./uri";

const logger = createLogger("PostgreSQL");
const host = uriHost(config.db.postgresUrl);

// ssl: true = TLS with certificate verification (Render rejects plain connections).
// An sslmode in DATABASE_URL overrides it (pg merges the parsed URL over this config),
// e.g. "?sslmode=disable" for a local Postgres without TLS.
const adapter = new PrismaPg({
	connectionString: config.db.postgresUrl,
	ssl: true
});

const prisma = new PrismaClient({ adapter });

export async function connectDatabase() {
	try {
		logger.debug(`Connecting to PostgreSQL at ${host}`);
		await prisma.$connect();
		logger.info("Connected to PostgreSQL");
	} catch (error) {
		logger.error(`Error connecting to PostgreSQL: ${safeErrorMessage(error)}`);
		process.exit(1);
	}
}

// Health check: real round trip, bounded so a hung connection cannot hang /health.
export async function isPostgresUp(timeoutMs = 3000): Promise<boolean> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
	try {
		return await Promise.race([prisma.$queryRaw`SELECT 1`.then(() => true, () => false), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

export default prisma;
