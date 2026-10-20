import { catchAndLogError, createLogger } from "../../utils/logger";
import AppError from "../../utils/AppError";
import { UUID_PATTERN } from "../../models/community/community.types";

const logger = createLogger("CommunityValidation");

export interface CommunityCursor {
	createdAt: Date;
	id: string;
}

export interface CommunityPageOptions {
	limit: number;
	cursor?: CommunityCursor;
}

export interface CommunityPage<T> {
	items: T[];
	hasMore: boolean;
	nextCursor: CommunityCursor | null;
}

export function uuid(value: unknown, field: string): string {
	try {
		logger.debug("uuid");
		if (typeof value !== "string" || !UUID_PATTERN.test(value.toLowerCase())) {
			throw new AppError(`Invalid ${field}: a UUID is required`, 400);
		}
		return value.toLowerCase();
	} catch (error) {
		return catchAndLogError(logger, error, "CommunityValidation: uuid failed");
	}
}

export function text(value: unknown, field: string, maxLength: number): string {
	try {
		logger.debug("text");
		if (typeof value !== "string" || value.length > maxLength || value.trim().length === 0) {
			throw new AppError(`Invalid ${field}: expected nonblank text up to ${maxLength} characters`, 400);
		}
		return value;
	} catch (error) {
		return catchAndLogError(logger, error, "CommunityValidation: text failed");
	}
}

export function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
	try {
		logger.debug("enumValue");
		if (typeof value !== "string" || !values.includes(value as T)) {
			throw new AppError(`Invalid ${field}`, 400);
		}
		return value as T;
	} catch (error) {
		return catchAndLogError(logger, error, "CommunityValidation: enumValue failed");
	}
}

export function revision(value: unknown): number {
	try {
		logger.debug("revision");
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
			throw new AppError("Invalid expectedRevision", 400);
		}
		return value;
	} catch (error) {
		return catchAndLogError(logger, error, "CommunityValidation: revision failed");
	}
}

export function pageOptions(options: CommunityPageOptions): CommunityPageOptions {
	try {
		logger.debug("pageOptions");
		if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
			throw new AppError("Invalid limit: expected an integer from 1 to 100", 400);
		}
		if (options.cursor === undefined) return { limit: options.limit };
		const cursor = options.cursor;
		if (!cursor || !(cursor.createdAt instanceof Date) || !Number.isFinite(cursor.createdAt.getTime())) {
			throw new AppError("Invalid cursor", 400);
		}
		return { limit: options.limit, cursor: { createdAt: new Date(cursor.createdAt), id: uuid(cursor.id, "cursor.id") } };
	} catch (error) {
		return catchAndLogError(logger, error, "CommunityValidation: pageOptions failed");
	}
}

export function cursorFilter(cursor?: CommunityCursor): Record<string, unknown> {
	try {
		logger.debug("cursorFilter");
		return cursor ? {
			$or: [
				{ createdAt: { $gt: cursor.createdAt } },
				{ createdAt: cursor.createdAt, _id: { $gt: cursor.id } }
			]
		} : {};
	} catch (error) {
		return catchAndLogError(logger, error, "CommunityValidation: cursorFilter failed");
	}
}

export function pageResult<T extends { _id: string; createdAt: Date }>(rows: T[], limit: number): CommunityPage<T> {
	try {
		logger.debug("pageResult");
		const hasMore = rows.length > limit;
		const items = rows.slice(0, limit);
		const last = items.at(-1);
		return {
			items,
			hasMore,
			nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last._id } : null
		};
	} catch (error) {
		return catchAndLogError(logger, error, "CommunityValidation: pageResult failed");
	}
}
