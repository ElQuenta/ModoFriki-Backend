import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import config from "../env";
import { createLogger } from "../../utils/logger";

const logger = createLogger("PostgreSQL");

const adapter = new PrismaPg({
  connectionString: config.db.postgresUrl
});


export async function connectDatabase() {
    try {
        logger.debug(`Connecting to PostgreSQL at ${config.db.postgresUrl}`);
        await prisma.$connect();
        logger.info("Connected to PostgreSQL");
    } catch (error) {
        logger.error(`Error connecting to PostgreSQL: ${error}`);
        process.exit(1);
    }
}

const prisma = new PrismaClient({ adapter });

export default prisma;