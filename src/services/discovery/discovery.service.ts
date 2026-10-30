import { discoveryRepository } from "../../repositories/discovery/discovery.repository";
import type { DiscoveryRepositoryContract, LatestChapter, LatestChaptersQuery, Paginated, PopularWork, PopularWorksQuery, RecommendedWorks, RecommendedWorksQuery } from "../../types/discovery.types";
import { latestChaptersQuerySchema, popularWorksQuerySchema, recommendedWorksQuerySchema, validateDiscovery } from "../../middlewares/schemas/discovery.schema";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("DiscoveryService");
const CACHE_MAX_ENTRIES = 500;

export interface DiscoveryCacheOptions { ttlMs: number; now?: () => number }

export class DiscoveryService {
	// ponytail: per-instance memory cache; with several instances each one caches its own copy (Redis if that matters).
	private readonly cache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
	constructor(private readonly repository: DiscoveryRepositoryContract = discoveryRepository, private readonly cacheOptions: DiscoveryCacheOptions = { ttlMs: 0 }) {}
	// Public, identical-for-everyone lists only. Keyed by the validated query, so equivalent URLs share an entry.
	private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
		const { ttlMs, now = Date.now } = this.cacheOptions;
		if (ttlMs <= 0) return load();
		const hit = this.cache.get(key);
		if (hit && hit.expiresAt > now()) return hit.value as Promise<T>;
		const value = load();
		// Failures are not cached; oldest entry is evicted first (Map keeps insertion order).
		value.catch(() => this.cache.delete(key));
		this.cache.delete(key);
		if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
		this.cache.set(key, { expiresAt: now() + ttlMs, value });
		return value;
	}
	private async run<T>(operation: () => Promise<T>): Promise<T> {
		try { logger.debug("Processing discovery operation"); return await operation(); }
		catch (error) { return catchAndLogError(logger, error, "Unable to process discovery operation"); }
	}
	listLatestChapters(input: unknown): Promise<Paginated<LatestChapter>> {
		return this.run(() => {
			const query = validateDiscovery<LatestChaptersQuery>(latestChaptersQuerySchema, input);
			return this.cached(`latest:${JSON.stringify(query)}`, () => this.repository.listLatestChapters(query));
		});
	}
	listPopularWorks(input: unknown): Promise<Paginated<PopularWork>> {
		return this.run(() => {
			const query = validateDiscovery<PopularWorksQuery>(popularWorksQuerySchema, input);
			return this.cached(`popular:${JSON.stringify(query)}`, () => this.repository.listPopularWorks(query));
		});
	}
	listRecommendedWorks(input: unknown, userId?: string): Promise<RecommendedWorks> {
		return this.run(() => {
			const { limit } = validateDiscovery<Pick<RecommendedWorksQuery, "limit">>(recommendedWorksQuerySchema, input);
			return this.repository.listRecommendedWorks({ userId, limit });
		});
	}
}

// Rankings and latest chapters may lag up to a minute behind publications and visits.
export const discoveryService = new DiscoveryService(discoveryRepository, { ttlMs: 60_000 });
