-- Generated offline from the existing Example schema, then extended with checks.
-- This file does not change Example or migrate data from MongoDB.
BEGIN;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BASIC', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('ROLE_CHANGED', 'EDITOR_ASSIGNED', 'EDITOR_REVOKED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "WorkReleaseStatus" AS ENUM ('ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChapterKind" AS ENUM ('NORMAL', 'EXTRA', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('AVAILABLE', 'DELETING');

-- CreateEnum
CREATE TYPE "UploadBatchStatus" AS ENUM ('PENDING', 'COMMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "UploadObjectStatus" AS ENUM ('PLANNED', 'UPLOADED', 'LINKED', 'CLEANED');

-- CreateEnum
CREATE TYPE "MediaCleanupStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BASIC',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'America/La_Paz',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEditorAssignment" (
    "id" UUID NOT NULL,
    "workId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkEditorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "subjectUserId" UUID,
    "workId" UUID,
    "action" "AdminAuditAction" NOT NULL,
    "previousRole" "UserRole",
    "newRole" "UserRole",
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "WorkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "typeId" UUID NOT NULL,
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "releaseStatus" "WorkReleaseStatus" NOT NULL DEFAULT 'ONGOING',
    "coverAssetId" UUID,
    "incapBannerAssetId" UUID,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAlternativeTitle" (
    "id" UUID NOT NULL,
    "workId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,

    CONSTRAINT "WorkAlternativeTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkGenre" (
    "id" UUID NOT NULL,
    "workId" UUID NOT NULL,
    "genreId" UUID NOT NULL,

    CONSTRAINT "WorkGenre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" UUID NOT NULL,
    "workId" UUID NOT NULL,
    "number" DECIMAL(12,3) NOT NULL,
    "title" TEXT,
    "kind" "ChapterKind" NOT NULL DEFAULT 'NORMAL',
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterPage" (
    "id" UUID NOT NULL,
    "chapterId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ChapterPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "pathname" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "generalBannerAssetId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRating" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workId" UUID NOT NULL,
    "scoreHalfStars" SMALLINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserChapterRead" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "chapterId" UUID NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT true,
    "firstReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserChapterRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterReadEvent" (
    "id" UUID NOT NULL,
    "chapterId" UUID NOT NULL,
    "userId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localDate" DATE,
    "timezoneAtEvent" TEXT,
    "idempotencyKey" UUID NOT NULL,

    CONSTRAINT "ChapterReadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkVisitEvent" (
    "id" UUID NOT NULL,
    "workId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" UUID NOT NULL,

    CONSTRAINT "WorkVisitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "chapterId" UUID,
    "workId" UUID,
    "status" "UploadBatchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadObject" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "pathname" TEXT NOT NULL,
    "assetId" UUID,
    "status" "UploadObjectStatus" NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "UploadObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCleanupJob" (
    "id" UUID NOT NULL,
    "assetId" UUID,
    "pathname" TEXT NOT NULL,
    "status" "MediaCleanupStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaCleanupJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");

-- CreateIndex
CREATE INDEX "WorkEditorAssignment_editorId_revokedAt_workId_idx" ON "WorkEditorAssignment"("editorId", "revokedAt", "workId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkEditorAssignment_workId_editorId_key" ON "WorkEditorAssignment"("workId", "editorId");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_actorId_occurredAt_idx" ON "AdminAuditEvent"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_subjectUserId_occurredAt_idx" ON "AdminAuditEvent"("subjectUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_workId_occurredAt_idx" ON "AdminAuditEvent"("workId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkType_name_key" ON "WorkType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkType_slug_key" ON "WorkType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Work_slug_key" ON "Work"("slug");

-- CreateIndex
CREATE INDEX "Work_typeId_publicationStatus_publishedAt_id_idx" ON "Work"("typeId", "publicationStatus", "publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkAlternativeTitle_workId_normalizedTitle_key" ON "WorkAlternativeTitle"("workId", "normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");

-- CreateIndex
CREATE INDEX "WorkGenre_genreId_workId_idx" ON "WorkGenre"("genreId", "workId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkGenre_workId_genreId_key" ON "WorkGenre"("workId", "genreId");

-- CreateIndex
CREATE INDEX "Chapter_workId_status_number_idx" ON "Chapter"("workId", "status", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_workId_number_key" ON "Chapter"("workId", "number");

-- CreateIndex
CREATE INDEX "ChapterPage_assetId_idx" ON "ChapterPage"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterPage_chapterId_position_key" ON "ChapterPage"("chapterId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_pathname_key" ON "MediaAsset"("pathname");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSettings_key_key" ON "SiteSettings"("key");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_id_idx" ON "Favorite"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Favorite_workId_idx" ON "Favorite"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_workId_key" ON "Favorite"("userId", "workId");

-- CreateIndex
CREATE INDEX "WorkRating_workId_idx" ON "WorkRating"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRating_userId_workId_key" ON "WorkRating"("userId", "workId");

-- CreateIndex
CREATE INDEX "UserChapterRead_userId_lastReadAt_id_idx" ON "UserChapterRead"("userId", "lastReadAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UserChapterRead_userId_chapterId_key" ON "UserChapterRead"("userId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterReadEvent_idempotencyKey_key" ON "ChapterReadEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ChapterReadEvent_chapterId_occurredAt_idx" ON "ChapterReadEvent"("chapterId", "occurredAt");

-- CreateIndex
CREATE INDEX "ChapterReadEvent_userId_localDate_idx" ON "ChapterReadEvent"("userId", "localDate");

-- CreateIndex
CREATE INDEX "ChapterReadEvent_occurredAt_idx" ON "ChapterReadEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkVisitEvent_idempotencyKey_key" ON "WorkVisitEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkVisitEvent_workId_occurredAt_idx" ON "WorkVisitEvent"("workId", "occurredAt");

-- CreateIndex
CREATE INDEX "UploadBatch_status_expiresAt_idx" ON "UploadBatch"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadObject_pathname_key" ON "UploadObject"("pathname");

-- CreateIndex
CREATE INDEX "UploadObject_batchId_idx" ON "UploadObject"("batchId");

-- CreateIndex
CREATE INDEX "UploadObject_assetId_idx" ON "UploadObject"("assetId");

-- CreateIndex
CREATE INDEX "MediaCleanupJob_status_nextAttemptAt_idx" ON "MediaCleanupJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MediaCleanupJob_assetId_idx" ON "MediaCleanupJob"("assetId");

-- AddForeignKey
ALTER TABLE "WorkEditorAssignment" ADD CONSTRAINT "WorkEditorAssignment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEditorAssignment" ADD CONSTRAINT "WorkEditorAssignment_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEditorAssignment" ADD CONSTRAINT "WorkEditorAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "WorkType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_incapBannerAssetId_fkey" FOREIGN KEY ("incapBannerAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAlternativeTitle" ADD CONSTRAINT "WorkAlternativeTitle_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGenre" ADD CONSTRAINT "WorkGenre_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGenre" ADD CONSTRAINT "WorkGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPage" ADD CONSTRAINT "ChapterPage_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPage" ADD CONSTRAINT "ChapterPage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_generalBannerAssetId_fkey" FOREIGN KEY ("generalBannerAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChapterRead" ADD CONSTRAINT "UserChapterRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChapterRead" ADD CONSTRAINT "UserChapterRead_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterReadEvent" ADD CONSTRAINT "ChapterReadEvent_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterReadEvent" ADD CONSTRAINT "ChapterReadEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkVisitEvent" ADD CONSTRAINT "WorkVisitEvent_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadObject" ADD CONSTRAINT "UploadObject_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadObject" ADD CONSTRAINT "UploadObject_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCleanupJob" ADD CONSTRAINT "MediaCleanupJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business integrity not expressible by the Prisma schema language.
ALTER TABLE "Chapter"
  ADD CONSTRAINT "Chapter_number_nonnegative" CHECK ("number" >= 0),
  ADD CONSTRAINT "Chapter_version_positive" CHECK ("version" > 0);

ALTER TABLE "ChapterPage"
  ADD CONSTRAINT "ChapterPage_position_positive" CHECK ("position" > 0);

ALTER TABLE "WorkRating"
  ADD CONSTRAINT "WorkRating_half_stars_range" CHECK ("scoreHalfStars" BETWEEN 0 AND 10);

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_size_positive" CHECK ("sizeBytes" > 0),
  ADD CONSTRAINT "MediaAsset_width_positive" CHECK ("width" IS NULL OR "width" > 0),
  ADD CONSTRAINT "MediaAsset_height_positive" CHECK ("height" IS NULL OR "height" > 0),
  ADD CONSTRAINT "MediaAsset_reference_nonempty" CHECK (
    length(btrim("pathname")) > 0 AND length(btrim("url")) > 0 AND length(btrim("contentType")) > 0
  );

ALTER TABLE "UserChapterRead"
  ADD CONSTRAINT "UserChapterRead_chronology" CHECK ("lastReadAt" >= "firstReadAt");

ALTER TABLE "WorkEditorAssignment"
  ADD CONSTRAINT "WorkEditorAssignment_chronology" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "assignedAt");

ALTER TABLE "ChapterReadEvent"
  ADD CONSTRAINT "ChapterReadEvent_identity_context" CHECK (
    ("userId" IS NULL AND "localDate" IS NULL AND "timezoneAtEvent" IS NULL)
    OR
    ("userId" IS NOT NULL AND "localDate" IS NOT NULL AND "timezoneAtEvent" IS NOT NULL
      AND length(btrim("timezoneAtEvent")) > 0)
  );

-- Anonymous completions remain distinct events; only registered daily contributions deduplicate.
CREATE UNIQUE INDEX "ChapterReadEvent_user_chapter_local_date_key"
  ON "ChapterReadEvent"("userId", "chapterId", "localDate")
  WHERE "userId" IS NOT NULL;

ALTER TABLE "UploadBatch"
  ADD CONSTRAINT "UploadBatch_exactly_one_target" CHECK (
    ("chapterId" IS NOT NULL AND "workId" IS NULL)
    OR ("chapterId" IS NULL AND "workId" IS NOT NULL)
  ),
  ADD CONSTRAINT "UploadBatch_expiry_after_creation" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "MediaCleanupJob"
  ADD CONSTRAINT "MediaCleanupJob_attempts_nonnegative" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "MediaCleanupJob_pathname_nonempty" CHECK (length(btrim("pathname")) > 0);

ALTER TABLE "UploadObject"
  ADD CONSTRAINT "UploadObject_pathname_nonempty" CHECK (length(btrim("pathname")) > 0);

COMMIT;