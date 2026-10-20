import { readingRepository } from "../../repositories/reading/reading.repository";
import type { ReadingActor, ReadingPage, ReadingRepositoryContract } from "../../types/reading.types";
import * as schemas from "../../middlewares/schemas/reading.schema";
import AppError from "../../utils/AppError";
import { catchAndLogError, createLogger } from "../../utils/logger";

const logger = createLogger("ReadingService");
const dayMilliseconds = 86400000;
interface PageInput { page: number; limit: number }
const shiftDay = (day: string, offset: number): string => new Date(+new Date(`${day}T00:00:00.000Z`) + offset * dayMilliseconds).toISOString().slice(0, 10);
const localDay = (timezone: string): string => {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
	return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
};

export class ReadingService {
	constructor(private readonly repository: ReadingRepositoryContract = readingRepository) {}
	private async run<T>(operation: () => Promise<T>): Promise<T> {
		try { logger.debug("Processing reading operation"); return await operation(); }
		catch (error) { return catchAndLogError(logger, error, "Unable to process reading operation"); }
	}
	private actor(actor?: ReadingActor): ReadingActor {
		if (!actor) throw new AppError("Authentication required", 401);
		return actor;
	}
	private id(id: string): string { return schemas.validateReading<string>(schemas.readingUuid, id); }
	private page(input: unknown): PageInput { return schemas.validateReading<PageInput>(schemas.readingPageSchema, input); }
	private pageInput(page: PageInput) { return { skip: (page.page - 1) * page.limit, take: page.limit }; }
	private pageResult<T>(result: ReadingPage<T>, page: PageInput) { return { items: result.items, total: result.total, page: page.page, limit: page.limit }; }
	recordVisit(workId: string, input: unknown) {
		return this.run(async () => {
			const id = this.id(workId);
			const body = schemas.validateReading<{ idempotencyKey: string }>(schemas.readingEventSchema, input);
			return this.repository.recordVisit(id, body.idempotencyKey);
		});
	}
	recordRead(chapterId: string, input: unknown, actor?: ReadingActor) {
		return this.run(async () => {
			const id = this.id(chapterId);
			const body = schemas.validateReading<{ idempotencyKey: string }>(schemas.readingEventSchema, input);
			return this.repository.recordRead(id, body.idempotencyKey, actor);
		});
	}
	setReadState(chapterId: string, isRead: boolean, actor?: ReadingActor) {
		return this.run(() => this.repository.setReadState(this.id(chapterId), isRead, this.actor(actor)));
	}
	setFavorite(workId: string, enabled: boolean, actor?: ReadingActor) {
		return this.run(() => this.repository.setFavorite(this.id(workId), enabled, this.actor(actor)));
	}
	listFavorites(input: unknown, actor?: ReadingActor) {
		return this.run(async () => { const page = this.page(input); return this.pageResult(await this.repository.listFavorites(this.actor(actor), this.pageInput(page)), page); });
	}
	setRating(workId: string, input: unknown, actor?: ReadingActor) {
		return this.run(async () => {
			const id = this.id(workId); const user = this.actor(actor);
			const body = schemas.validateReading<{ score: number }>(schemas.readingRatingSchema, input);
			const result = await this.repository.setRating(id, body.score * 2, user);
			return { workId: result.workId, score: result.scoreHalfStars === null ? null : result.scoreHalfStars / 2 };
		});
	}
	removeRating(workId: string, actor?: ReadingActor) { return this.run(() => this.repository.setRating(this.id(workId), null, this.actor(actor))); }
	getProgress(workId: string, input: unknown, actor?: ReadingActor) {
		return this.run(async () => {
			const page = this.page(input);
			const { scoreHalfStars, chapters, ...state } = await this.repository.getWorkState(this.id(workId), this.actor(actor), this.pageInput(page));
			return { ...state, score: scoreHalfStars === null ? null : scoreHalfStars / 2,
				completionPercentage: state.totalChapters === 0 ? 0 : state.readChapters / state.totalChapters * 100,
				chapters: this.pageResult(chapters, page) };
		});
	}
	listHistory(input: unknown, actor?: ReadingActor) {
		return this.run(async () => { const page = this.page(input); return this.pageResult(await this.repository.listHistory(this.actor(actor), this.pageInput(page)), page); });
	}
	getCalendar(input: unknown, actor?: ReadingActor) {
		return this.run(async () => {
			const user = this.actor(actor);
			const query = schemas.validateReading<{ from?: string; to?: string }>(schemas.readingCalendarSchema, input);
			const to = query.to ?? localDay(user.timezone);
			const from = query.from ?? shiftDay(to, -364);
			const span = (+new Date(`${to}T00:00:00.000Z`) - +new Date(`${from}T00:00:00.000Z`)) / dayMilliseconds;
			if (!Number.isInteger(span) || span < 0 || span > 365) throw new AppError("Invalid calendar range; maximum 366 days", 400);
			const activity = new Map((await this.repository.getCalendar(user, from, to)).map(day => [day.date, day.chaptersRead]));
			const days = Array.from({ length: span + 1 }, (_, index) => { const date = shiftDay(from, index); return { date, chaptersRead: activity.get(date) ?? 0 }; });
			return { timezone: user.timezone, from, to, days };
		});
	}
	getStats(actor?: ReadingActor) { return this.run(() => this.repository.getStats(this.actor(actor))); }
	getWorkStats(workId: string) { return this.run(() => this.repository.getWorkStats(this.id(workId))); }
}

export const readingService = new ReadingService();
