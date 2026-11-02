import type { PlanMarker, PlanMarkerInput, SitePlan } from "@/server/domain";

export type SitePlanInput = Omit<SitePlan, "id" | "isArchived" | "uploadedBy">;

/** Site plans (attached to the site) and the markers placed on them during a visit. */
export interface PlanRepository {
  listBySite(siteId: string, includeArchived?: boolean): Promise<SitePlan[]>;
  findById(id: string): Promise<SitePlan | null>;
  create(input: SitePlanInput): Promise<SitePlan>;
  archive(id: string, archived: boolean): Promise<SitePlan>;

  listMarkers(visitId: string, planId?: string): Promise<PlanMarker[]>;
  addMarker(visitId: string, input: PlanMarkerInput): Promise<PlanMarker>;
  updateMarker(id: string, input: Partial<PlanMarkerInput>): Promise<PlanMarker>;
  removeMarker(id: string): Promise<void>;
}
