import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import config from "../env";

const adapter = new PrismaPg({
  connectionString: config.db.postgresUrl
});


export async function connectDatabase() {
    try {
        await prisma.$connect();
    } catch (error) {
        process.exit(1);
    }
}

const prisma = new PrismaClient({ adapter });

export default prisma;