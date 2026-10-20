import { compare, hash, hashSync } from "bcryptjs";
import { JsonWebTokenError, sign, verify } from "jsonwebtoken";
import config from "../../config/env";
import { UUID_PATTERN } from "../../models/community/community.types";
import { authRepository } from "../../repositories/auth/auth.repository";
import type { AuthRepositoryContract, AuthResult, UserDto, UserRecord } from "../../types/auth.types";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("AuthService");
const tokenLifetime = 7 * 24 * 60 * 60;
const roles = ["BASIC", "EDITOR", "ADMIN"];

function dummyHash(): string {
	try {
		return hashSync("dummy-login-comparison", config.bcryptSaltRounds);
	} catch (error) {
		return catchAndLogError(logger, error, "Unable to initialize authentication");
	}
}
const missingUserHash = dummyHash();

export class AuthService {
	constructor(private readonly users: Pick<AuthRepositoryContract, "findByEmail" | "findById" | "create"> = authRepository) {}

	private credentials(input: unknown, registration: boolean): { email: string; password: string; username?: string; timezone?: string } {
		try {
			if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError("Invalid credentials input", 400);
			const body = input as Record<string, unknown>;
			const allowed = registration ? ["username", "email", "password", "timezone"] : ["email", "password"];
			if (Object.keys(body).some((key) => !allowed.includes(key))) throw new AppError("Unknown credentials field", 400);
			if (typeof body.email !== "string" || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
				throw new AppError("Invalid email", 400);
			}
			if (typeof body.password !== "string" || [...body.password].length < 8 || Buffer.byteLength(body.password, "utf8") > 72) {
				throw new AppError("Password must contain at least 8 characters and at most 72 UTF-8 bytes", 400);
			}
			let username: string | undefined;
			let timezone: string | undefined;
			if (registration) {
				if (typeof body.username !== "string" || body.username.trim().length < 3 || body.username.trim().length > 32) throw new AppError("Username must contain 3 to 32 characters", 400);
				username = body.username.trim();
				if (body.timezone !== undefined) {
					if (typeof body.timezone !== "string" || body.timezone.length > 100 || body.timezone.trim() !== body.timezone || /^[+-]/.test(body.timezone)) throw new AppError("Invalid timezone", 400);
					try {
						new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format();
					} catch (error) {
						return catchAndLogError(logger, new AppError("Invalid timezone", 400), "Unable to validate timezone");
					}
					timezone = body.timezone;
				}
			}
			return { email: body.email.trim(), password: body.password, username, timezone };
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to validate authentication input");
		}
	}

	private dto(user: UserRecord): UserDto {
		try {
			return { id: user.id, email: user.email, username: user.username, role: user.role, timezone: user.timezone, createdAt: user.createdAt.toISOString() };
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to read authentication result");
		}
	}

	private result(user: UserRecord): AuthResult {
		try {
			return { user: this.dto(user), token: sign({ id: user.id, role: user.role }, config.jwtSecret, { algorithm: "HS256", expiresIn: tokenLifetime }) };
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to issue authentication result");
		}
	}

	async register(input: unknown): Promise<AuthResult> {
		try {
			logger.debug("Registering basic user");
			const credentials = this.credentials(input, true);
			const user = await this.users.create({ username: credentials.username!, email: credentials.email,
				passwordHash: await hash(credentials.password, config.bcryptSaltRounds), timezone: credentials.timezone });
			return this.result(user);
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to register user");
		}
	}

	async login(input: unknown): Promise<AuthResult> {
		try {
			logger.debug("Authenticating credentials");
			const credentials = this.credentials(input, false);
			const user = await this.users.findByEmail(credentials.email.toLowerCase());
			const matches = await compare(credentials.password, user?.passwordHash ?? missingUserHash);
			if (!user || user.status !== "ACTIVE" || user.deletedAt !== null || !matches) throw new AppError("Invalid email or password", 401);
			return this.result(user);
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to authenticate credentials");
		}
	}

	async me(id: string): Promise<UserDto> {
		try {
			logger.debug("Reading active identity");
			if (typeof id !== "string" || !UUID_PATTERN.test(id)) throw new AppError("Authentication required", 401);
			const user = await this.users.findById(id);
			if (!user || user.status !== "ACTIVE" || user.deletedAt !== null) throw new AppError("Authentication required", 401);
			return this.dto(user);
		} catch (error) {
			return catchAndLogError(logger, error, "Unable to read identity");
		}
	}

	async authenticateToken(token: string): Promise<UserDto> {
		try {
			logger.debug("Verifying token and active identity");
			const payload = verify(token, config.jwtSecret, { algorithms: ["HS256"], maxAge: "7d" });
			if (typeof payload !== "object" || typeof payload.id !== "string" || !UUID_PATTERN.test(payload.id)
				|| !roles.includes(payload.role) || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
				|| payload.iat! > Math.floor(Date.now() / 1000) || payload.exp! <= payload.iat! || payload.exp! - payload.iat! > tokenLifetime) {
				throw new AppError("Invalid or expired token", 401);
			}
			return await this.me(payload.id);
		} catch (error) {
			return catchAndLogError(logger, error instanceof JsonWebTokenError ? new AppError("Invalid or expired token", 401) : error, "Unable to authenticate token");
		}
	}
}

export const authService = new AuthService();
