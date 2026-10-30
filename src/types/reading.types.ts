export interface ReadingActor { id: string; timezone: string }
export interface ReadingPageInput { skip?: number; take?: number }
export interface ReadingPage<T> { items: T[]; total: number; skip: number; take: number }
export interface ReadingEventResult { counted: boolean; occurredAt: Date; isRead?: boolean }
export interface ReadStateRecord { chapterId: string; isRead: boolean; firstReadAt: Date; lastReadAt: Date }
export interface ReadingWorkSummary { id: string; title: string; slug: string; coverUrl: string | null; thumbUrl: string | null }
export interface FavoriteItem { work: ReadingWorkSummary; createdAt: Date }
export interface ReadingHistoryItem extends ReadStateRecord { work: ReadingWorkSummary; chapter: { id: string; number: string; title: string | null } }
export interface WorkReadingState { workId: string; isFavorite: boolean; scoreHalfStars: number | null; totalChapters: number; readChapters: number; chapters: ReadingPage<{ chapterId: string; isRead: boolean; firstReadAt: Date | null; lastReadAt: Date | null; number: string; title: string | null }> }
export interface ReadingDay { date: string; chaptersRead: number }
export interface ReadingStats { markedReadChapters: number; favorites: number; recordedReads: number; activeDays: number; readsToday: number; readsLast7Days: number; readsLast30Days: number; currentStreak: number; longestStreak: number; lastReadingDate: string | null; timezone: string }
export interface ReadingWorkStats { workId: string; visits: number; visitsLast24Hours: number; reads: number; readsLast24Hours: number; favorites: number; ratings: number; averageRating: number | null }
export interface ReadingRepositoryContract {
 recordVisit(workId: string, idempotencyKey: string): Promise<ReadingEventResult>;
 recordRead(chapterId: string, idempotencyKey: string, actor?: ReadingActor): Promise<ReadingEventResult>;
 setReadState(chapterId: string, isRead: boolean, actor: ReadingActor): Promise<ReadStateRecord | null>;
 setFavorite(workId: string, enabled: boolean, actor: ReadingActor): Promise<{ workId: string; isFavorite: boolean }>;
 listFavorites(actor: ReadingActor, page?: ReadingPageInput): Promise<ReadingPage<FavoriteItem>>;
 setRating(workId: string, scoreHalfStars: number | null, actor: ReadingActor): Promise<{ workId: string; scoreHalfStars: number | null }>;
 getWorkState(workId: string, actor: ReadingActor, page?: ReadingPageInput): Promise<WorkReadingState>;
 listHistory(actor: ReadingActor, page?: ReadingPageInput): Promise<ReadingPage<ReadingHistoryItem>>;
 getCalendar(actor: ReadingActor, from: string, to: string): Promise<ReadingDay[]>;
 getStats(actor: ReadingActor): Promise<ReadingStats>;
 getWorkStats(workId: string): Promise<ReadingWorkStats>;
}
