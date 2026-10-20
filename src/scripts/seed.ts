import prisma from "../config/database/postgres";
import { createLogger } from "../utils/logger";

const logger = createLogger("Seed");
const email = "angeloquenta@gmail.com";
const username = "angeloquenta";
// Precomputed bcrypt hash (cost 12); the plaintext password is not stored here.
const passwordHash = "$2b$12$H22x/pKZc1ezWPMx2D7VsODbn.cZUU4cejyTmlCPdrK1vlSCeThkC";

async function seed(): Promise<void> {
	try {
		await prisma.user.deleteMany({ where: { emailNormalized: email.toLowerCase() } });
		await prisma.user.upsert({
			where: { emailNormalized: email.toLowerCase() },
			create: {
				email, emailNormalized: email.toLowerCase(),
				username, usernameNormalized: username.toLowerCase(),
				passwordHash, role: "ADMIN", status: "ACTIVE", timezone: "America/La_Paz"
			},
			update: { passwordHash, role: "ADMIN", status: "ACTIVE", deletedAt: null },
			select: { id: true }
		});
		logger.info("Administrator seed completed");
	} catch {
		logger.error("Unable to seed administrator; check database availability, migrations and username uniqueness");
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
}

void seed().catch(() => {
	logger.error("Unable to close seed database connection");
	process.exitCode = 1;
});
