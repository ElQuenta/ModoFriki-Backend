import { del } from "@vercel/blob";
import type { RequestHandler } from "express";
import config from "../../config/env";
import type { MediaRepositoryContract } from "../../types/catalog.types";
import { assertMediaPath } from "../../utils/media-paths";
import { createLogger } from "../../utils/logger";

const logger = createLogger("ChapterMediaReplacement");
type Repository = Pick<MediaRepositoryContract, "claimReplacedChapterAssets" | "markChapterAssetRemoved">;
type RemoveFile = (pathname: string) => Promise<void>;
const removeFile: RemoveFile = async pathname => {
 if (!config.blob.readWriteToken) throw new Error("MEDIA_NOT_CONFIGURED");
 await del(pathname, { token: config.blob.readWriteToken, abortSignal: AbortSignal.timeout(30_000) });
};

/** Runs only after a chapter's new generation has committed successfully. No queue or timer. */
export const deleteReplacedChapterMedia = (repository: Repository, remove: RemoveFile = removeFile): RequestHandler => async (_req, res, next) => {
 const context = res.locals.catalogPrepared?.context;
 if (!res.locals.catalogSaved || !res.locals.catalogPrepared?.pagesRequired || !context?.chapterId || context.creating || !context.replacedPageAssetIds?.length) {
  next(); return;
 }
 try {
  const assets = await repository.claimReplacedChapterAssets(context.chapterId, context.replacedPageAssetIds);
  for (const asset of assets) {
   try {
    assertMediaPath(asset.pathname);
    if (!asset.pathname.startsWith(`${context.workSlug}/Chapter-${context.chapterId.slice(0, 4)}/`)) throw new Error("INVALID_REPLACED_CHAPTER_PATH");
    await remove(asset.pathname);
    await repository.markChapterAssetRemoved(asset.id);
   } catch { logger.warn("Previous chapter file could not be removed; the new chapter remains saved"); }
  }
 } catch { logger.error("Unable to verify previous chapter files; the new chapter remains saved"); }
 next();
};
