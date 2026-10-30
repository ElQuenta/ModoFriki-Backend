-- Aditiva: miniatura WebP de la portada (generada por `npm run media:thumbnails`).
-- Nullable y sin backfill: el front usa la portada original mientras no exista.
ALTER TABLE "Work" ADD COLUMN "coverThumbAssetId" UUID;

CREATE INDEX "Work_coverThumbAssetId_idx" ON "Work"("coverThumbAssetId");

ALTER TABLE "Work" ADD CONSTRAINT "Work_coverThumbAssetId_fkey" FOREIGN KEY ("coverThumbAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
