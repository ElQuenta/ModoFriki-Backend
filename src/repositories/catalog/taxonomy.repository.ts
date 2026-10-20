import prisma from "../../config/database/postgres";
import type { PrismaClient } from "../../generated/prisma/client";
import type { CatalogActor, TaxonomyRepositoryContract } from "../../types/catalog.types";
import { catchAndLogError, createLogger } from "../../utils/logger";
import { authorize, persistenceError } from "./catalog.persistence";
const logger = createLogger("TaxonomyRepository");
export class TaxonomyRepository implements TaxonomyRepositoryContract {
 constructor(private readonly client: PrismaClient = prisma) {}
 async listTypes() { try { return await this.client.workType.findMany({ orderBy: { name: "asc" } }); } catch (error) { return catchAndLogError(logger, error, "Unable to list work types"); } }
 async listGenres() { try { return await this.client.genre.findMany({ orderBy: { name: "asc" } }); } catch (error) { return catchAndLogError(logger, error, "Unable to list genres"); } }
 async createType(name: string, slug: string, actor: CatalogActor) {
  try { return await this.client.$transaction(async tx => { await authorize(tx, actor); return tx.workType.create({ data: { name, slug } }); }); }
  catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to create work type"); }
 }
 async createGenre(name: string, slug: string, actor: CatalogActor) {
  try { return await this.client.$transaction(async tx => { await authorize(tx, actor); return tx.genre.create({ data: { name, slug } }); }); }
  catch (error) { return catchAndLogError(logger, persistenceError(error), "Unable to create genre"); }
 }
}
export const taxonomyRepository = new TaxonomyRepository();
