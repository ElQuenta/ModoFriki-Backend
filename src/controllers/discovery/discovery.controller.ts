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
	listLatestChapters = this.handle(async (req, res) => { SuccessResponseHandler(res, await this.service.listLatestChapters(req.query)); });
	listPopularWorks = this.handle(async (req, res) => { SuccessResponseHandler(res, await this.service.listPopularWorks(req.query)); });
}
