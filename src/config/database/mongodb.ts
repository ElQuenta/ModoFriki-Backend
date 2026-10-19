import mongoose from "mongoose";
import config from "../env";
import {createLogger} from "../../utils/logger";

const logger = createLogger("MongoDB");

export const connectMongoDB = async () => {
  try {
    logger.debug(`Connecting to MongoDB at ${config.db.mongoUrl}`);
    await mongoose.connect(config.db.mongoUrl);
    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error}`);
    process.exit(1);
  }
};