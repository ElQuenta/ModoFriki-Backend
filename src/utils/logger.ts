import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getCallSites } from "node:util";
import { configure } from "safe-stable-stringify";
import { createLogger as createWinstonLogger, format, transports, type Logger } from "winston";
import config from "../config/env";
import AppError from "./AppError";

const stringify = configure({ deterministic: false });
const levelColors: Record<string, number> = {
	error: 91,
	warn: 93,
	info: 92,
	http: 95,
	verbose: 96,
	debug: 94,
	silly: 97
};

export const createLogger = (service: string): Logger => {
	const colorsEnabled = process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== "0";
	const colorize = (value: unknown, color: number): string => {
		return colorsEnabled ? `\u001b[${color}m${String(value)}\u001b[0m` : String(value);
	};
	const formatMetadata = (metadata: Record<string, unknown>): string => {
		const json = stringify(metadata, (_key, value: unknown) => {
			if (typeof value === "bigint") return value.toString();
			if (value instanceof Error) {
				return { ...value, name: value.name, message: value.message, stack: value.stack };
			}
			return value;
		}, 2) ?? "{}";

		return json.replace(
			/"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g,
			(token) => {
				if (token.startsWith('"')) return colorize(token, token.endsWith(":") ? 96 : 92);
				if (token === "true" || token === "false") return colorize(token, 93);
				if (token === "null") return colorize(token, 90);
				if (/^-?\d/.test(token)) return colorize(token, 95);
				return colorize(token, 90);
			}
		);
	};

	return createWinstonLogger({
		level: config.logLevel,
		format: format.combine(
			format.errors({ stack: true }),
			format.timestamp({ format: "HH:mm:ss.SSS" }),
			format.printf(({ timestamp, level, message, ...metadata }) => {
				const header = [
					colorize(timestamp, 90),
					colorize(level.toUpperCase(), levelColors[level] ?? 97),
					colorize(`[${service}]`, levelColors[level] ?? 97),
					String(message)
				].join(" ");
				const content = Object.keys(metadata).length > 0
					? `\n${formatMetadata(metadata)}`
					: "";

				return `${header}${content}`;
			})
		),
		transports: [new transports.Console()]
	});
};

export const catchAndLogError = (
	logger: Logger,
	error: unknown,
	message: string
): never => {
  if (!(error instanceof AppError)) {
    logger.error(message, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }

  throw error instanceof AppError ? error : new AppError(message, 500);
};
