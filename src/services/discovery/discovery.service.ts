import { discoveryRepository } from "../../repositories/discovery/discovery.repository";
import type { DiscoveryRepositoryContract, LatestChapter, LatestChaptersQuery, Paginated, PopularWork, PopularWorksQuery } from "../../types/discovery.types";
import { latestChaptersQuerySchema, popularWorksQuerySchema, validateDiscovery } from "../../middlewares/schemas/discovery.schema";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("DiscoveryService");

export class DiscoveryService {
	constructor(private readonly repository: DiscoveryRepositoryContract = discoveryRepository) {}
	private async run<T>(operation: () => Promise<T>): Promise<T> {
		try { logger.debug("Processing discovery operation"); return await operation(); }
		catch (error) { return catchAndLogError(logger, error, "Unable to process discovery operation"); }
	}
	listLatestChapters(input: unknown): Promise<Paginated<LatestChapter>> {
		return this.run(() => this.repository.listLatestChapters(validateDiscovery<LatestChaptersQuery>(latestChaptersQuerySchema, input)));
	}
	listPopularWorks(input: unknown): Promise<Paginated<PopularWork>> {
		return this.run(() => this.repository.listPopularWorks(validateDiscovery<PopularWorksQuery>(popularWorksQuerySchema, input)));
	}
}

export const discoveryService = new DiscoveryService();
