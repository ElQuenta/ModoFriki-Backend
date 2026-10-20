import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import type { AuthRepositoryContract, CreateUserInput, PublicAuthorRecord, UserRecord } from "../../types/auth.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("AuthRepository");

export class AuthRepository implements AuthRepositoryContract {
	constructor(private readonly client: Pick<PrismaClient, "user"> = prisma) {}

	async findByEmail(email: string): Promise<UserRecord | null> {
		try {
			logger.debug("Finding active user by normalized email");
			return await this.client.user.findUnique({
				where: { emailNormalized: email.trim().toLowerCase(), status: "ACTIVE", deletedAt: null }
			});
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to find user");
		}
	}

	async findById(id: string): Promise<UserRecord | null> {
		try {
			logger.debug("Finding active user");
			return await this.client.user.findUnique({ where: { id, status: "ACTIVE", deletedAt: null } });
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to find user");
		}
	}

	async findByIds(ids: string[]): Promise<PublicAuthorRecord[]> {
		try {
			logger.debug("Finding active users");
			if (ids.length === 0) return [];
			return await this.client.user.findMany({
				where: { id: { in: [...new Set(ids)] }, status: "ACTIVE", deletedAt: null },
				select: { id: true, username: true, status: true, deletedAt: true }
			});
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to find users");
		}
	}

	async create(input: CreateUserInput): Promise<UserRecord> {
		try {
			logger.debug("Creating basic active user");
			const email = input.email.trim();
			const username = input.username.trim();
			return await this.client.user.create({ data: {
				email, emailNormalized: email.toLowerCase(),
				username, usernameNormalized: username.toLowerCase(),
				passwordHash: input.passwordHash,
				role: "BASIC", status: "ACTIVE",
				...(input.timezone === undefined ? {} : { timezone: input.timezone })
			} });
		} catch (error) {
			const failure = typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
				? new AppError("Email or username already exists", 409) : error;
			return catchAndLogError(logger, failure, "Unable to create user");
		}
	}
}

export const authRepository = new AuthRepository();
