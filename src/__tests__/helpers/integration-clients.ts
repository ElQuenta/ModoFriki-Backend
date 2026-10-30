// Loaded dynamically by integration.ts only after validating and mapping test destinations.
export { default as prisma } from "../../config/database/postgres";
export { default as mongoose } from "mongoose";
export { default as config } from "../../config/env";
