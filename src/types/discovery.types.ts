import type { ChapterKind } from "../generated/prisma/enums";

export interface Paginated<T> { items: T[]; total: number; page: number; limit: number }
export interface WorkRef { id: string; slug: string; title: string; coverUrl: string | null }
export interface LatestChapter {
	id: string; workId: string; number: string; title: string | null;
	kind: ChapterKind; publishedAt: Date; work: WorkRef;
}
export interface LatestChaptersQuery { page: number; limit: number; typeId?: string }
export interface PopularWork { work: WorkRef; visits: number }
export interface PopularWorksQuery { period: "all" | "day"; page: number; limit: number; typeId?: string }
export interface RecommendedWorks { basis: "genres" | "popular"; items: PopularWork[] }
export interface RecommendedWorksQuery { userId?: string; limit: number }
export interface DiscoveryRepositoryContract {
	listLatestChapters(query: LatestChaptersQuery): Promise<Paginated<LatestChapter>>;
	listPopularWorks(query: PopularWorksQuery): Promise<Paginated<PopularWork>>;
	listRecommendedWorks(query: RecommendedWorksQuery): Promise<RecommendedWorks>;
}
