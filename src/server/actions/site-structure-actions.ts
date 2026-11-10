"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import type { SiteBuildingView, SiteViewView } from "@/lib/plans/structure";
import { userMessage } from "@/server/errors";
import {
  archiveSchema,
  assignPagesSchema,
  createBuildingSchema,
  outlineInputSchema,
  renameSchema,
  reorderBuildingsSchema,
  reorderViewsSchema,
  replaceImageSchema,
  siteIdSchema,
} from "@/server/plans/structure-schemas";
import type { SiteStructureService } from "@/server/plans/structure-service";
import type { SiteStructureView } from "@/server/plans/types";
import { siteStructureForReader, siteStructureForWriter } from "@/server/services/site-structure";

/** Outcome of a configuration action: the value, or a message in French. */
export type StructureResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function run<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  work: (service: SiteStructureService, data: z.infer<S>) => Promise<T>,
  options: { write?: boolean } = { write: true },
): Promise<StructureResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  }
  try {
    const service = options.write ? await siteStructureForWriter() : await siteStructureForReader();
    const value = await work(service, parsed.data);
    if (options.write) revalidatePath("/sites/[code]", "page");
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

/** Buildings, views and pages of a site (configuration screen, signed URLs renewed). */
export async function getSiteStructureAction(
  input: unknown,
): Promise<StructureResult<SiteStructureView>> {
  return run(siteIdSchema, input, (s, d) => s.getStructure(d.siteId), { write: false });
}

/** « Affecter les pages » after an import. */
export async function assignPagesAction(input: unknown): Promise<StructureResult<SiteViewView[]>> {
  return run(assignPagesSchema, input, (s, d) => s.assignPages(d.siteId, d.planId, d.assignments));
}

/** « Nouveau bâtiment ». */
export async function createBuildingAction(
  input: unknown,
): Promise<StructureResult<SiteBuildingView>> {
  return run(createBuildingSchema, input, (s, d) => s.createBuilding(d.siteId, d.name));
}

/** Renames a building. */
export async function renameBuildingAction(
  input: unknown,
): Promise<StructureResult<SiteBuildingView>> {
  return run(renameSchema, input, (s, d) => s.renameBuilding(d.id, d.name));
}

/** Saves (or removes) the outline of a building on the exterior view. */
export async function setBuildingOutlineAction(
  input: unknown,
): Promise<StructureResult<SiteBuildingView>> {
  return run(outlineInputSchema, input, (s, d) => s.setOutline(d.id, d.outline));
}

/** Archives or restores a building (its levels are archived with it). */
export async function setBuildingArchivedAction(
  input: unknown,
): Promise<StructureResult<SiteBuildingView>> {
  return run(archiveSchema, input, (s, d) => s.setBuildingArchived(d.id, d.archived));
}

/** New order of the buildings. */
export async function reorderBuildingsAction(input: unknown): Promise<StructureResult<null>> {
  return run(reorderBuildingsSchema, input, async (s, d) => {
    await s.reorderBuildings(d.siteId, d.orderedIds);
    return null;
  });
}

/** New order of the levels of a building, from the bottom up. */
export async function reorderViewsAction(input: unknown): Promise<StructureResult<null>> {
  return run(reorderViewsSchema, input, async (s, d) => {
    await s.reorderViews(d.buildingId, d.orderedIds);
    return null;
  });
}

/** Renames a level (or the exterior view). */
export async function renameViewAction(input: unknown): Promise<StructureResult<SiteViewView>> {
  return run(renameSchema, input, (s, d) => s.renameView(d.id, d.name));
}

/** Archives or restores a view. */
export async function setViewArchivedAction(
  input: unknown,
): Promise<StructureResult<SiteViewView>> {
  return run(archiveSchema, input, (s, d) => s.setViewArchived(d.id, d.archived));
}

/** Replaces the image of a level by another page (the old view keeps its markers). */
export async function replaceViewImageAction(
  input: unknown,
): Promise<StructureResult<SiteViewView>> {
  return run(replaceImageSchema, input, (s, d) =>
    s.replaceViewImage(d.viewId, d.planId, d.pageNumber),
  );
}
