BEGIN;

ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_SANCTION_IMPOSED';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_SANCTION_REVOKED';
CREATE TYPE "CommentCreationState" AS ENUM ('PREPARED', 'COMMITTED', 'REJECTED');
CREATE TYPE "CommentRejectionCode" AS ENUM ('SANCTIONED', 'ACCOUNT_UNAVAILABLE', 'EXPIRED', 'CANCELLED', 'TARGET_UNAVAILABLE');

CREATE TABLE "CommentSanction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "imposedById" UUID NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "revokedById" UUID,
  "closedAt" TIMESTAMPTZ(3),
  "evidenceType" VARCHAR(7),
  "evidenceId" UUID,
  CONSTRAINT "CommentSanction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommentSanction_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 2000),
  CONSTRAINT "CommentSanction_ends_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "CommentSanction_evidence_check" CHECK (
    ("evidenceType" IS NULL AND "evidenceId" IS NULL) OR
    ("evidenceType" IS NOT NULL AND "evidenceId" IS NOT NULL AND "evidenceType" IN ('COMMENT', 'REPORT'))
  ),
  CONSTRAINT "CommentSanction_closure_check" CHECK (
    ("revokedAt" IS NULL AND "revokedById" IS NULL AND "closedAt" IS NULL) OR
    ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL AND "closedAt" IS NOT NULL
      AND "closedAt" = "revokedAt" AND "revokedAt" >= "startsAt"
      AND ("endsAt" IS NULL OR "revokedAt" < "endsAt")) OR
    ("revokedAt" IS NULL AND "revokedById" IS NULL AND "closedAt" IS NOT NULL
      AND "endsAt" IS NOT NULL AND "closedAt" = "endsAt")
  )
);

CREATE TABLE "CommentCreationDecision" (
  "id" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "state" "CommentCreationState" NOT NULL,
  "requestFingerprint" CHAR(64) NOT NULL,
  "preparedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "decidedAt" TIMESTAMPTZ(3),
  "rejectionCode" "CommentRejectionCode",
  CONSTRAINT "CommentCreationDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommentCreationDecision_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CommentCreationDecision_expiry_check" CHECK ("expiresAt" = "preparedAt" + interval '60 seconds'),
  CONSTRAINT "CommentCreationDecision_decided_check" CHECK ("decidedAt" IS NULL OR "decidedAt" >= "preparedAt"),
  CONSTRAINT "CommentCreationDecision_state_check" CHECK (
    ("state" = 'PREPARED' AND "decidedAt" IS NULL AND "rejectionCode" IS NULL) OR
    ("state" = 'COMMITTED' AND "decidedAt" IS NOT NULL AND "decidedAt" < "expiresAt" AND "rejectionCode" IS NULL) OR
    ("state" = 'REJECTED' AND "decidedAt" IS NOT NULL AND "rejectionCode" IS NOT NULL
      AND "rejectionCode" IN ('SANCTIONED', 'ACCOUNT_UNAVAILABLE', 'EXPIRED', 'CANCELLED', 'TARGET_UNAVAILABLE'))
  )
);

ALTER TABLE "CommentSanction" ADD CONSTRAINT "CommentSanction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommentSanction" ADD CONSTRAINT "CommentSanction_imposedById_fkey" FOREIGN KEY ("imposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommentSanction" ADD CONSTRAINT "CommentSanction_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommentCreationDecision" ADD CONSTRAINT "CommentCreationDecision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdminAuditEvent" ADD COLUMN "sanctionId" UUID;
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_sanctionId_fkey" FOREIGN KEY ("sanctionId") REFERENCES "CommentSanction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CommentSanction_userId_startsAt_id_idx" ON "CommentSanction"("userId", "startsAt" DESC, "id" DESC);
CREATE UNIQUE INDEX "CommentSanction_userId_open_key" ON "CommentSanction"("userId") WHERE "closedAt" IS NULL;
CREATE INDEX "CommentCreationDecision_authorId_state_id_idx" ON "CommentCreationDecision"("authorId", "state", "id");
CREATE INDEX "CommentCreationDecision_state_expiresAt_id_idx" ON "CommentCreationDecision"("state", "expiresAt", "id");
CREATE INDEX "AdminAuditEvent_sanctionId_occurredAt_idx" ON "AdminAuditEvent"("sanctionId", "occurredAt");

COMMIT;
