import type { RequestHandler } from "express";
import { ErrorResponseHandler } from "../../handlers/error.handler";
import { SuccessResponseHandler } from "../../handlers/success.handler";
import { discoveryService, type DiscoveryService } from "../../services/discovery/discovery.service";
import { createLogger } from "../../utils/logger";

const logger = createLogger("DiscoveryController");

export class DiscoveryController {
	constructor(private readonly service: DiscoveryService = discoveryService) {}
	private handle(action: RequestHandler): RequestHandler {
		return async (req, res, next) => {
			try { logger.debug("Handling discovery request"); await action(req, res, next); }
			catch (error) { logger.error("Unable to handle discovery request"); ErrorResponseHandler(res, error); }
		};
	}
	// Same data for everyone: browsers and CDNs may reuse it for a minute (matches the service cache).
	listLatestChapters = this.handle(async (req, res) => { const data = await this.service.listLatestChapters(req.query); res.set("Cache-Control", "public, max-age=60"); SuccessResponseHandler(res, data); });
	listPopularWorks = this.handle(async (req, res) => { const data = await this.service.listPopularWorks(req.query); res.set("Cache-Control", "public, max-age=60"); SuccessResponseHandler(res, data); });
	listRecommendedWorks = this.handle(async (req, res) => {
		res.set("Cache-Control", "private, no-store");
		res.vary("Authorization");
		SuccessResponseHandler(res, await this.service.listRecommendedWorks(req.query, res.locals.user?.id));
	});
}
