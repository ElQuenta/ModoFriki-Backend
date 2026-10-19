import mongoose from "mongoose";
import config from "../env";
import { createLogger } from "../../utils/logger";
import { safeErrorMessage, uriHost } from "./uri";

const logger = createLogger("MongoDB");
const host = uriHost(config.db.mongoUrl);

export const connectMongoDB = async () => {
	try {
		logger.debug(`Connecting to MongoDB at ${host}`);
		await mongoose.connect(config.db.mongoUrl);
		logger.info("Connected to MongoDB");
	} catch (error) {
		logger.error(`Error connecting to MongoDB: ${safeErrorMessage(error)}`);
		process.exit(1);
	}
};
