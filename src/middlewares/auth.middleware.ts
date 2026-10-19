import type { RequestHandler } from "express";
import { verify } from "jsonwebtoken";
import config from "../config/env";
import { ErrorResponseHandler } from "../handlers/error.handler";
import type { AuthUser, Role } from "../types/express";
import AppError from "../utils/AppError";

const roles: Role[] = ["USER", "ADMIN"];

const verifyToken = (token: string): AuthUser => {
	try {
		const payload = verify(token, config.jwtSecret, { algorithms: ["HS256"] });

		if (typeof payload === "object" && typeof payload.id === "string" && roles.includes(payload.role)) {
			return { id: payload.id, role: payload.role };
		}
	} catch {
		// Firma inválida, token expirado o alg no permitido: mismo 401 que un payload inválido.
	}

	throw new AppError("Invalid or expired token", 401);
};

export const authenticate: RequestHandler = (req, res, next) => {
	try {
		const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");

		if (!match) {
			throw new AppError("Authentication required", 401);
		}

		req.user = verifyToken(match[1]);
	} catch (error) {
		ErrorResponseHandler(res, error);
		return;
	}

	next();
};
