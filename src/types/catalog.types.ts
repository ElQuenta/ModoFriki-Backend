import type { Prisma, WorkType, Genre } from "../generated/prisma/client";
import type { ChapterKind, PublicationStatus, WorkReleaseStatus, UserRole } from "../generated/prisma/enums";

export interface CatalogActor { id: string; role: UserRole }
export interface AssetInput { id: string; url: string; pathname: string; contentType: string; size: number; fieldName?: string; position?: number }
export type UploadedMedia = AssetInput[];
export interface UploadContext { workId: string; chapterId?: string; workSlug: string; actorId: string; batchId?: string; expectedVersion?: number; expectedUpdatedAt?: Date; creating?: boolean; replacedPageAssetIds?: string[] }
export interface WorkInput { title: string; synopsis: string; typeId: string; publicationStatus?: PublicationStatus; releaseStatus?: WorkReleaseStatus; alternativeTitles?: string[]; genreIds?: string[] }
export type WorkPatch = Partial<WorkInput>;
export interface ChapterInput { number: string | number; title?: string | null; kind?: ChapterKind; status?: PublicationStatus }
export type ChapterPatch = Partial<ChapterInput>;
export interface CatalogListInput { skip?: number; take?: number; search?: string; typeId?: string; genreId?: string; includeDrafts?: boolean }
export type WorkRecord = Prisma.WorkGetPayload<{ include: { type: true; coverAsset: true; incapBannerAsset: true; alternativeTitles: true; genres: { include: { genre: true } } } }>;
export type ChapterRecord = Prisma.ChapterGetPayload<{ include: { pages: { include: { asset: true } } } }>;
export interface WorkSaveInput { actor: CatalogActor; workId: string; data: WorkPatch; expectedUpdatedAt: Date; assets?: AssetInput[]; batchId?: string; creating?: boolean }
export interface ChapterSaveInput { actor: CatalogActor; workId: string; chapterId: string; data: ChapterPatch; expectedVersion: number; pages?: AssetInput[]; batchId?: string; creating?: boolean }
export interface WorkRepositoryContract {
 list(input?: CatalogListInput, actor?: CatalogActor): Promise<WorkRecord[]>;
 findById(id: string, actor?: CatalogActor): Promise<WorkRecord | null>;
 findForEdit(id: string, actor: CatalogActor): Promise<WorkRecord>;
 reserve(id: string, slug: string, input: WorkInput, actor: CatalogActor): Promise<WorkRecord>;
 save(input: WorkSaveInput): Promise<WorkRecord>;
 remove(id: string, actor: CatalogActor, expectedUpdatedAt: Date): Promise<void>;
 abortReservation(id: string, actorId: string): Promise<void>;
}
export interface ChapterRepositoryContract {
 list(workId: string, input?: CatalogListInput, actor?: CatalogActor): Promise<ChapterRecord[]>;
 findById(workId: string, id: string, actor?: CatalogActor): Promise<ChapterRecord | null>;
 findForEdit(workId: string, id: string, actor: CatalogActor): Promise<ChapterRecord>;
 reserve(id: string, workId: string, input: ChapterInput, actor: CatalogActor): Promise<ChapterRecord>;
 save(input: ChapterSaveInput): Promise<ChapterRecord>;
 remove(workId: string, id: string, actor: CatalogActor, expectedVersion: number): Promise<void>;
 abortReservation(id: string, actorId: string): Promise<void>;
}
export interface TaxonomyRepositoryContract {
 listTypes(): Promise<WorkType[]>; listGenres(): Promise<Genre[]>;
 createType(name: string, slug: string, actor: CatalogActor): Promise<WorkType>;
 createGenre(name: string, slug: string, actor: CatalogActor): Promise<Genre>;
}
export interface BeginBatchInput { id?: string; actorId: string; workId?: string; chapterId?: string; expiresAt?: Date }
export interface ReplacedChapterAsset { id: string; pathname: string }
export interface MediaRepositoryContract {
 beginBatch(input: BeginBatchInput): Promise<{ id: string }>;
 planObject(batchId: string, pathname: string): Promise<{ id: string }>;
 markUploaded(batchId: string, pathname: string): Promise<void>;
 abandonBatch(batchId: string): Promise<void>;
 claimReplacedChapterAssets(chapterId: string, assetIds: string[]): Promise<ReplacedChapterAsset[]>;
 markChapterAssetRemoved(assetId: string): Promise<void>;
}
