import { describe, expect, it } from "vitest";
import { catalogDto } from "../catalog/catalog.controller";

describe("catalogDto", () => {
	it("quita los campos internos en cualquier nivel y conserva los públicos", () => {
		const work = {
			id: "w1", status: "PUBLISHED", workId: "w0", createdById: "u1", updatedById: "u1", deletedAt: null,
			coverAssetId: "a1", incapBannerAssetId: null,
			coverAsset: { id: "a1", url: "https://blob/cover.png", pathname: "works/cover.png", sizeBytes: 10n, width: 600 },
			pages: [{ id: "p1", position: 1, assetId: "a2", asset: { id: "a2", url: "https://blob/p1.png", pathname: "works/p1.png" } }]
		};

		expect(catalogDto(work)).toEqual({
			id: "w1", status: "PUBLISHED", workId: "w0",
			coverAsset: { id: "a1", url: "https://blob/cover.png", width: 600 },
			pages: [{ id: "p1", position: 1, asset: { id: "a2", url: "https://blob/p1.png" } }]
		});
	});

	it("serializa BigInt como string", () => {
		expect(catalogDto({ visits: 5n })).toEqual({ visits: "5" });
	});
});
