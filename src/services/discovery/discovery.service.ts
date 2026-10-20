import { discoveryRepository } from "../../repositories/discovery/discovery.repository";
import type { DiscoveryRepositoryContract, LatestChapter, LatestChaptersQuery, Paginated, PopularWork, PopularWorksQuery, RecommendedWorks, RecommendedWorksQuery } from "../../types/discovery.types";
import { latestChaptersQuerySchema, popularWorksQuerySchema, recommendedWorksQuerySchema, validateDiscovery } from "../../middlewares/schemas/discovery.schema";
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
	listRecommendedWorks(input: unknown, userId?: string): Promise<RecommendedWorks> {
		return this.run(() => {
			const { limit } = validateDiscovery<Pick<RecommendedWorksQuery, "limit">>(recommendedWorksQuerySchema, input);
			return this.repository.listRecommendedWorks({ userId, limit });
		});
	}
}

export const discoveryService = new DiscoveryService();
