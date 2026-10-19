import mongoose from "mongoose";
import config from "../env";

export const connectMongoDB = async () => {
  try {
    await mongoose.connect(config.db.mongoUrl);
  } catch (error) {
    process.exit(1);
  }
};