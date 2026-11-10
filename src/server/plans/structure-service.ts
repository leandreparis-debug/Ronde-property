import "server-only";

import type { RelativePoint } from "@/lib/plans/structure";
import type { UserRef } from "@/server/db/context";
import { ConflictError } from "@/server/errors";
import type { StorageService } from "@/server/storage/types";

import { createPlanService } from "./service";
import { createSiteStructureRepository, type PageAssignment } from "./structure-repository";
import type { SitePageRef, SiteStructureView } from "./types";

/** Message of a page already used by another active view (unique index). */
const PAGE_TAKEN = "Cette page sert déjà une autre vue : choisissez-en une autre.";

async function friendly<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ConflictError) throw new ConflictError(PAGE_TAKEN, { cause: error });
    throw error;
  }
}

/**
 * Buildings, levels and exterior view of a site (step 12 b). Reads are made as the user (RLS),
 * then the page images are signed: no signed URL without a row read under RLS.
 */
export function createSiteStructureService(user: UserRef, storage: StorageService) {
  const repository = createSiteStructureRepository(user);
  const plans = createPlanService(user, storage);
  return {
    repository,

    /** Buildings, views (archived included) and every page of the site's ready plans. */
    async getStructure(siteId: string): Promise<SiteStructureView> {
      const [{ buildings, views }, planList] = await Promise.all([
        repository.listForSite(siteId),
        plans.listForSite(siteId, { includeArchived: true }),
      ]);
      const activeByPage = new Map(
        views.filter((v) => !v.isArchived).map((v) => [`${v.planId}:${v.pageNumber}`, v.id]),
      );
      const pages: SitePageRef[] = [];
      for (const plan of planList) {
        try {
          const detail = await plans.getDetail(plan.id);
          for (const page of detail.pages) {
            pages.push({
              planId: plan.id,
              planName: plan.name,
              planArchived: plan.isArchived,
              pageNumber: page.pageNumber,
              width: page.width,
              height: page.height,
              imageUrl: page.imageUrl,
              thumbUrl: page.thumbUrl,
              urlsExpireAt: page.urlsExpireAt,
              viewId: activeByPage.get(`${plan.id}:${page.pageNumber}`) ?? null,
            });
          }
        } catch {
          // A plan whose pages cannot be read is left out (purged or not visible).
        }
      }
      return { buildings, views, pages };
    },

    assignPages: (siteId: string, planId: string, assignments: PageAssignment[]) =>
      friendly(repository.assignPages(siteId, planId, assignments)),
    replaceViewImage: (viewId: string, planId: string, pageNumber: number) =>
      friendly(repository.replaceViewImage(viewId, planId, pageNumber)),
    createBuilding: (siteId: string, name: string) => repository.createBuilding(siteId, name),
    renameBuilding: (id: string, name: string) => repository.renameBuilding(id, name),
    setOutline: (id: string, outline: RelativePoint[] | null) => repository.setOutline(id, outline),
    setBuildingArchived: (id: string, archived: boolean) =>
      repository.setBuildingArchived(id, archived),
    reorderBuildings: (siteId: string, ids: string[]) => repository.reorderBuildings(siteId, ids),
    reorderViews: (buildingId: string, ids: string[]) => repository.reorderViews(buildingId, ids),
    renameView: (id: string, label: string) => repository.renameView(id, label),
    setViewArchived: (id: string, archived: boolean) =>
      friendly(repository.setViewArchived(id, archived)),
  };
}

export type SiteStructureService = ReturnType<typeof createSiteStructureService>;
