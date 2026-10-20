import app from "./app";

import config from "./config/env";
import { connectDatabase } from "./config/database/postgres";
import { connectMongoDB } from "./config/database/mongodb";
import { createLogger } from "./utils/logger";
import { mediaRepository } from "./repositories/catalog/media.repository";
import { startMediaCleanup } from "./services/media/cleanup.service";

const logger = createLogger("Server");
const port = config.port;

const start = async () => {
	await connectDatabase();
	await connectMongoDB();
	startMediaCleanup(mediaRepository);
	app.listen(port, (error) => {
		if (error) {
			logger.error(`Error starting server: ${error.message}`);
			process.exit(1);
		}
		logger.http(`Server running on http://localhost:${port}`);
	});
};

void start();
