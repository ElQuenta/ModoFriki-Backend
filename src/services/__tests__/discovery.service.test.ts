import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/discovery/discovery.repository", () => ({ discoveryRepository: {} }));

import { DiscoveryService } from "../discovery/discovery.service";
import AppError from "../../utils/AppError";

const typeId = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const page = { items: [], total: 0, page: 1, limit: 12 };

const makeRepo = () => ({
	listLatestChapters: vi.fn(async () => page),
	listPopularWorks: vi.fn(async () => page),
	listRecommendedWorks: vi.fn(async () => ({ basis: "popular" as const, items: [] }))
});
const expectStatus = async (promise: Promise<unknown>, status: number) => {
	const error = await promise.catch((e: unknown) => e);
	expect(error).toBeInstanceOf(AppError);
	expect((error as AppError).statusCode).toBe(status);
};

let repo: ReturnType<typeof makeRepo>;
let service: DiscoveryService;

beforeEach(() => {
	repo = makeRepo();
	service = new DiscoveryService(repo);
});

describe("DiscoveryService.listLatestChapters", () => {
	it("applies defaults page=1 limit=12 for an empty query", async () => {
		await service.listLatestChapters({});
		expect(repo.listLatestChapters).toHaveBeenCalledWith({ page: 1, limit: 12 });
	});

	it("applies defaults page=1 limit=12 when the query is undefined", async () => {
		await service.listLatestChapters(undefined);
		expect(repo.listLatestChapters).toHaveBeenCalledWith({ page: 1, limit: 12 });
	});

	it("converts string query values and lowercases typeId", async () => {
		await service.listLatestChapters({ page: "2", limit: "50", typeId: typeId.toUpperCase() });
		expect(repo.listLatestChapters).toHaveBeenCalledWith({ page: 2, limit: 50, typeId });
	});

	it.each([
		["limit > 50", { limit: "51" }],
		["limit = 0", { limit: "0" }],
		["page = 0", { page: "0" }],
		["non-numeric page", { page: "abc" }],
		["invalid typeId", { typeId: "not-a-uuid" }],
		["braced typeId", { typeId: `{${typeId}}` }],
		["unknown key", { sort: "asc" }]
	])("returns 400 for %s without calling the repository", async (_name, query) => {
		await expectStatus(service.listLatestChapters(query), 400);
		expect(repo.listLatestChapters).not.toHaveBeenCalled();
	});

	it("wraps unexpected repository errors as 500", async () => {
		repo.listLatestChapters.mockRejectedValue(new Error("db down"));
		await expectStatus(service.listLatestChapters({}), 500);
	});
});

describe("DiscoveryService.listPopularWorks", () => {
	it("defaults period=all page=1 limit=12", async () => {
		await service.listPopularWorks({});
		expect(repo.listPopularWorks).toHaveBeenCalledWith({ period: "all", page: 1, limit: 12 });
	});

	it("accepts period=day with typeId", async () => {
		await service.listPopularWorks({ period: "day", typeId });
		expect(repo.listPopularWorks).toHaveBeenCalledWith({ period: "day", page: 1, limit: 12, typeId });
	});

	it.each([
		["invalid period", { period: "week" }],
		["limit > 50", { limit: "100" }],
		["invalid typeId", { typeId: "123" }],
		["unknown key", { foo: "bar" }]
	])("returns 400 for %s", async (_name, query) => {
		await expectStatus(service.listPopularWorks(query), 400);
		expect(repo.listPopularWorks).not.toHaveBeenCalled();
	});
});

describe("DiscoveryService.listRecommendedWorks", () => {
	it("defaults limit=12 and passes the token userId to the repository", async () => {
		await service.listRecommendedWorks({}, userId);
		expect(repo.listRecommendedWorks).toHaveBeenCalledWith({ userId, limit: 12 });
	});

	it("passes undefined userId for anonymous requests", async () => {
		await service.listRecommendedWorks({ limit: "5" });
		expect(repo.listRecommendedWorks).toHaveBeenCalledWith({ userId: undefined, limit: 5 });
	});

	it("rejects userId in the query with 400 (cannot impersonate another user)", async () => {
		await expectStatus(service.listRecommendedWorks({ userId: typeId }, userId), 400);
		expect(repo.listRecommendedWorks).not.toHaveBeenCalled();
	});

	it.each([
		["limit > 50", { limit: "51" }],
		["page not allowed", { page: "1" }],
		["typeId not allowed", { typeId }]
	])("returns 400 for %s", async (_name, query) => {
		await expectStatus(service.listRecommendedWorks(query, userId), 400);
		expect(repo.listRecommendedWorks).not.toHaveBeenCalled();
	});
});
