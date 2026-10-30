BEGIN;

ALTER TABLE "Work" ADD COLUMN "bannerAssetId" UUID;
ALTER TABLE "Work" ADD COLUMN "legacyPublicationImagesExempt" BOOLEAN NOT NULL DEFAULT false;

-- Only records with a previous publication are exempt. A currently PUBLISHED
-- record without this evidence remains subject to the new invariant.
UPDATE "Work"
SET "legacyPublicationImagesExempt" = true
WHERE "publishedAt" IS NOT NULL;

ALTER TABLE "Work"
  ADD CONSTRAINT "Work_bannerAssetId_fkey"
  FOREIGN KEY ("bannerAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Work_bannerAssetId_idx" ON "Work"("bannerAssetId");

-- NOT VALID preserves already inconsistent historical rows while enforcing
-- every insert and update made after this migration.
ALTER TABLE "Work" ADD CONSTRAINT "Work_published_images_check"
CHECK (
  "publicationStatus" <> 'PUBLISHED'
  OR (
    "coverAssetId" IS NOT NULL
    AND ("legacyPublicationImagesExempt" OR ("bannerAssetId" IS NOT NULL AND "incapBannerAssetId" IS NOT NULL))
  )
) NOT VALID;

COMMIT;
