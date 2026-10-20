-- Additive: existing ChapterReadEvent keys remain valid without a backfill.
-- Keep this table and its receipts during application rollback to preserve retries.
BEGIN;

CREATE TABLE "ChapterReadReceipt" (
    "idempotencyKey" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterReadReceipt_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE INDEX "ChapterReadReceipt_eventId_idx" ON "ChapterReadReceipt"("eventId");

ALTER TABLE "ChapterReadReceipt" ADD CONSTRAINT "ChapterReadReceipt_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "ChapterReadEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
