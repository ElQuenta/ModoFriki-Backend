import app from "./app";

import config from "./config/env";
import { connectDatabase } from "./config/database/postgres";
import { connectMongoDB } from "./config/database/mongodb";
import { createLogger } from "./utils/logger";

const logger = createLogger("Server");
const port = config.port;

// Connect first, listen after: no request arrives before the databases are ready.
// Both connectors exit(1) on failure, so Render restarts the service.
async function start() {
	await connectDatabase();
	await connectMongoDB();
	app.listen(port, () => logger.http(`Server running on http://localhost:${port}`));
}

void start();
