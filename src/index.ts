import app from "./app";

import config from "./config/env";
import { connectDatabase } from "./config/database/postgres";
import { connectMongoDB } from "./config/database/mongodb";
import { createLogger } from "./utils/logger";

const logger = createLogger("Server");
const port = config.port;

app.listen(port, () => {
  connectDatabase();
  connectMongoDB();
  logger.http(`Server running on http://localhost:${port}`);
});
