import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

const envSchema = Joi.object({
	NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
	PORT: Joi.number().port().default(3000),
	DATABASE_URL: Joi.string().uri({ scheme: ["postgresql", "postgres"] }).required(),
	MONGODB_URI: Joi.string().uri({ scheme: ["mongodb", "mongodb+srv"] }).required(),
	JWT_SECRET: Joi.string().min(32).required(),
	BCRYPT_SALT_ROUNDS: Joi.number().integer().min(4).max(31).default(12),
	BLOB_READ_WRITE_TOKEN: Joi.string().allow("").optional(),
	FRONTEND_URL: Joi.string().uri({ scheme: ["http", "https"] }).allow("").optional(),
	LOG_LEVEL: Joi.string().valid("error", "warn", "info", "http", "verbose", "debug", "silly").default("info")
}).unknown(true);

const { error, value } = envSchema.validate(process.env, {
	abortEarly: false,
	convert: true
});

if (error) {
	throw new Error(`Invalid environment variables: ${error.message}`);
}

interface EnvironmentVariables {
	nodeEnv: "development" | "test" | "production";
	port: number;
	jwtSecret: string;
	bcryptSaltRounds: number;
	db: {
		postgresUrl: string;
		mongoUrl: string;
	};
	blob: {
		readWriteToken?: string;
	};
	frontendUrl?: string;
	logLevel: "error" | "warn" | "info" | "http" | "verbose" | "debug" | "silly";
}

const config: EnvironmentVariables = {
	nodeEnv: value.NODE_ENV,
	port: value.PORT,
	jwtSecret: value.JWT_SECRET,
	bcryptSaltRounds: value.BCRYPT_SALT_ROUNDS,
	db: {
		postgresUrl: value.DATABASE_URL,
		mongoUrl: value.MONGODB_URI
	},
	blob: {
		readWriteToken: value.BLOB_READ_WRITE_TOKEN
	},
	frontendUrl: value.FRONTEND_URL?.replace(/\/+$/, "") || undefined,
	logLevel: value.LOG_LEVEL
};

export default config;
