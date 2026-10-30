BEGIN;

-- Existing rows begin at the first concurrency version. The default keeps new
-- assignments compatible with the same optimistic-concurrency contract.
ALTER TABLE "WorkEditorAssignment"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3);

-- Preserve the original assignment chronology for stable cursor pagination.
UPDATE "WorkEditorAssignment"
SET "createdAt" = "assignedAt";

ALTER TABLE "WorkEditorAssignment"
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ADD CONSTRAINT "WorkEditorAssignment_version_positive" CHECK ("version" > 0);

CREATE INDEX "WorkEditorAssignment_editorId_createdAt_id_idx"
  ON "WorkEditorAssignment"("editorId", "createdAt", "id");

COMMIT;
