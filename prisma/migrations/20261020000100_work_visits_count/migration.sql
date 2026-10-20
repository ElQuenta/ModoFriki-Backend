-- Additive: aggregated visit counter for rankings; backfilled from existing events.
BEGIN;

ALTER TABLE "Work" ADD COLUMN "visitsCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Work" w SET "visitsCount" = v.total
FROM (SELECT "workId", COUNT(*)::int AS total FROM "WorkVisitEvent" GROUP BY "workId") v
WHERE v."workId" = w."id";

CREATE INDEX "Work_publicationStatus_deletedAt_visitsCount_idx" ON "Work"("publicationStatus", "deletedAt", "visitsCount");

COMMIT;
