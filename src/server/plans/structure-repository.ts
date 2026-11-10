import "server-only";

import { sql } from "kysely";

import {
  cleanStructureLabel,
  outlineError,
  type RelativePoint,
  type SiteBuildingView,
  type SiteViewKind,
  type SiteViewView,
  structureLabelError,
} from "@/lib/plans/structure";
import { type Trx, type UserRef, withUser } from "@/server/db/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Buildings and views of a site (step 12 b), always read and written as the user (RLS:
 * read by every active user, written by RT and admin). Nothing is ever deleted: buildings and
 * views are archived, and the image of a level is replaced by a new view.
 */

/** Where one page of an imported plan goes (« Affecter les pages »). */
export type PageAssignment =
  | { pageNumber: number; target: "exterior" }
  | { pageNumber: number; target: "level"; buildingId: string; label: string }
  | { pageNumber: number; target: "new-building"; buildingName: string; label: string }
  | { pageNumber: number; target: "skip" };

function selectBuildings(trx: Trx) {
  return trx
    .selectFrom("site_buildings")
    .select(["id", "site_id", "name", "sort_order", "outline", "is_archived"]);
}

function selectViews(trx: Trx) {
  return trx
    .selectFrom("site_views")
    .select([
      "id",
      "site_id",
      "kind",
      "building_id",
      "label",
      "sort_order",
      "plan_id",
      "page_number",
      "replaced_by",
      "is_archived",
    ]);
}

type BuildingRow = Awaited<ReturnType<ReturnType<typeof selectBuildings>["execute"]>>[number];
type ViewRow = Awaited<ReturnType<ReturnType<typeof selectViews>["execute"]>>[number];

function toBuilding(row: BuildingRow): SiteBuildingView {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    sortOrder: row.sort_order,
    outline: (row.outline as RelativePoint[] | null) ?? null,
    isArchived: row.is_archived,
  };
}

function toView(row: ViewRow): SiteViewView {
  return {
    id: row.id,
    siteId: row.site_id,
    kind: row.kind as SiteViewKind,
    buildingId: row.building_id,
    label: row.label,
    sortOrder: row.sort_order,
    planId: row.plan_id,
    pageNumber: row.page_number,
    replacedBy: row.replaced_by,
    isArchived: row.is_archived,
  };
}

const NOT_ALLOWED = "Vous ne pouvez pas modifier la configuration de ce site.";

/** An update that touched no row was refused by RLS (or targets nothing): say so. */
function expectUpdated(result: { numUpdatedRows: bigint }[] | { numUpdatedRows: bigint }) {
  const rows = Array.isArray(result)
    ? result.reduce((n, r) => n + r.numUpdatedRows, 0n)
    : result.numUpdatedRows;
  if (rows === 0n) throw new ForbiddenError(NOT_ALLOWED);
}

function checkedName(value: string, what: "name" | "label"): string {
  const error = structureLabelError(value, what);
  if (error) throw new ValidationError(error);
  return cleanStructureLabel(value);
}

async function nextOrder(
  trx: Trx,
  table: "site_buildings" | "site_views",
  column: string,
  id: string,
) {
  const row = await trx
    .selectFrom(table)
    .select(sql<number>`coalesce(max(sort_order) + 1, 0)`.as("next"))
    .where(sql.ref(column), "=", id)
    .where("is_archived", "=", false)
    .executeTakeFirst();
  return Number(row?.next ?? 0);
}

async function buildingOf(trx: Trx, id: string): Promise<SiteBuildingView> {
  const row = await selectBuildings(trx).where("id", "=", id).executeTakeFirst();
  if (!row) throw new NotFoundError("Bâtiment introuvable.");
  return toBuilding(row);
}

async function viewOf(trx: Trx, id: string): Promise<SiteViewView> {
  const row = await selectViews(trx).where("id", "=", id).executeTakeFirst();
  if (!row) throw new NotFoundError("Vue introuvable.");
  return toView(row);
}

/** Creates the repository of the buildings and views, bound to the user. */
export function createSiteStructureRepository(user: UserRef) {
  return {
    /** Buildings and views of a site, archived ones included (the screens filter). */
    async listForSite(siteId: string) {
      return withUser(user, async (trx) => {
        const [buildings, views] = await Promise.all([
          selectBuildings(trx).where("site_id", "=", siteId).orderBy("sort_order").execute(),
          selectViews(trx)
            .where("site_id", "=", siteId)
            .orderBy("sort_order")
            .orderBy("created_at")
            .execute(),
        ]);
        return { buildings: buildings.map(toBuilding), views: views.map(toView) };
      });
    },

    async createBuilding(siteId: string, name: string): Promise<SiteBuildingView> {
      return withUser(user, async (trx) => {
        const row = await trx
          .insertInto("site_buildings")
          .values({
            site_id: siteId,
            name: checkedName(name, "name"),
            sort_order: await nextOrder(trx, "site_buildings", "site_id", siteId),
          })
          .returning(["id", "site_id", "name", "sort_order", "outline", "is_archived"])
          .executeTakeFirstOrThrow();
        return toBuilding(row);
      });
    },

    async renameBuilding(id: string, name: string): Promise<SiteBuildingView> {
      return withUser(user, async (trx) => {
        expectUpdated(
          await trx
            .updateTable("site_buildings")
            .set({ name: checkedName(name, "name") })
            .where("id", "=", id)
            .execute(),
        );
        return buildingOf(trx, id);
      });
    },

    /** Sets (or removes, with `null`) the outline of a building on the exterior view. */
    async setOutline(id: string, outline: RelativePoint[] | null): Promise<SiteBuildingView> {
      if (outline) {
        const error = outlineError(outline);
        if (error) throw new ValidationError(error);
      }
      const value = outline
        ? outline.map((p) => ({ x: Math.round(p.x * 1e5) / 1e5, y: Math.round(p.y * 1e5) / 1e5 }))
        : null;
      return withUser(user, async (trx) => {
        expectUpdated(
          await trx
            .updateTable("site_buildings")
            .set({ outline: value === null ? null : JSON.stringify(value) })
            .where("id", "=", id)
            .execute(),
        );
        return buildingOf(trx, id);
      });
    },

    async setBuildingArchived(id: string, archived: boolean): Promise<SiteBuildingView> {
      return withUser(user, async (trx) => {
        expectUpdated(
          await trx
            .updateTable("site_buildings")
            .set({ is_archived: archived })
            .where("id", "=", id)
            .execute(),
        );
        if (archived) {
          // Its levels go with it: no new marker on a building that no longer exists.
          await trx
            .updateTable("site_views")
            .set({ is_archived: true })
            .where("building_id", "=", id)
            .where("is_archived", "=", false)
            .execute();
        }
        return buildingOf(trx, id);
      });
    },

    /** New order of the buildings of a site (the ids not listed keep their place after). */
    async reorderBuildings(siteId: string, orderedIds: string[]) {
      return withUser(user, async (trx) => {
        for (const [index, id] of orderedIds.entries()) {
          expectUpdated(
            await trx
              .updateTable("site_buildings")
              .set({ sort_order: index })
              .where("id", "=", id)
              .where("site_id", "=", siteId)
              .execute(),
          );
        }
      });
    },

    /** New order of the levels of a building, from the bottom up. */
    async reorderViews(buildingId: string, orderedIds: string[]) {
      return withUser(user, async (trx) => {
        for (const [index, id] of orderedIds.entries()) {
          expectUpdated(
            await trx
              .updateTable("site_views")
              .set({ sort_order: index })
              .where("id", "=", id)
              .where("building_id", "=", buildingId)
              .execute(),
          );
        }
      });
    },

    async renameView(id: string, label: string): Promise<SiteViewView> {
      return withUser(user, async (trx) => {
        expectUpdated(
          await trx
            .updateTable("site_views")
            .set({ label: checkedName(label, "label") })
            .where("id", "=", id)
            .execute(),
        );
        return viewOf(trx, id);
      });
    },

    async setViewArchived(id: string, archived: boolean): Promise<SiteViewView> {
      return withUser(user, async (trx) => {
        expectUpdated(
          await trx
            .updateTable("site_views")
            .set({ is_archived: archived })
            .where("id", "=", id)
            .execute(),
        );
        return viewOf(trx, id);
      });
    },

    /**
     * Replaces the image of a view by another page: a new view takes its place (same kind,
     * building, label and order); the old one is archived and points to the new one, so the
     * markers of past visits stay on the image they were placed on.
     */
    async replaceViewImage(id: string, planId: string, pageNumber: number): Promise<SiteViewView> {
      return withUser(user, async (trx) => {
        const old = await viewOf(trx, id);
        if (old.isArchived) throw new ValidationError("Cette vue est archivée.");
        if (old.planId === planId && old.pageNumber === pageNumber) {
          throw new ValidationError("Choisissez une autre page.");
        }
        expectUpdated(
          await trx
            .updateTable("site_views")
            .set({ is_archived: true })
            .where("id", "=", id)
            .execute(),
        );
        const created = await trx
          .insertInto("site_views")
          .values({
            site_id: old.siteId,
            kind: old.kind,
            building_id: old.buildingId,
            label: old.label,
            sort_order: old.sortOrder,
            plan_id: planId,
            page_number: pageNumber,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        await trx
          .updateTable("site_views")
          .set({ replaced_by: created.id })
          .where("id", "=", id)
          .execute();
        return viewOf(trx, created.id);
      });
    },

    /**
     * « Affecter les pages » after an import: each page becomes the exterior view (replacing
     * the current one), a level of an existing or new building, or is left unused. One
     * transaction; two pages sent to the same new building name share that building.
     */
    async assignPages(siteId: string, planId: string, assignments: PageAssignment[]) {
      return withUser(user, async (trx) => {
        const created = new Map<string, string>();
        const views: SiteViewView[] = [];
        if (assignments.filter((a) => a.target === "exterior").length > 1) {
          throw new ValidationError("Une seule page peut être la vue extérieure.");
        }
        for (const assignment of assignments) {
          if (assignment.target === "skip") continue;
          if (assignment.target === "exterior") {
            const current = await selectViews(trx)
              .where("site_id", "=", siteId)
              .where("kind", "=", "exterior")
              .where("is_archived", "=", false)
              .executeTakeFirst();
            if (current) {
              await trx
                .updateTable("site_views")
                .set({ is_archived: true })
                .where("id", "=", current.id)
                .execute();
            }
            const row = await trx
              .insertInto("site_views")
              .values({
                site_id: siteId,
                kind: "exterior",
                building_id: null,
                label: "Vue extérieure",
                sort_order: 0,
                plan_id: planId,
                page_number: assignment.pageNumber,
              })
              .returning("id")
              .executeTakeFirstOrThrow();
            if (current) {
              await trx
                .updateTable("site_views")
                .set({ replaced_by: row.id })
                .where("id", "=", current.id)
                .execute();
            }
            views.push(await viewOf(trx, row.id));
            continue;
          }
          let buildingId: string;
          if (assignment.target === "new-building") {
            const name = checkedName(assignment.buildingName, "name");
            const key = name.toLocaleLowerCase("fr");
            const known = created.get(key);
            if (known) {
              buildingId = known;
            } else {
              const row = await trx
                .insertInto("site_buildings")
                .values({
                  site_id: siteId,
                  name,
                  sort_order: await nextOrder(trx, "site_buildings", "site_id", siteId),
                })
                .returning("id")
                .executeTakeFirstOrThrow();
              buildingId = row.id;
              created.set(key, buildingId);
            }
          } else {
            buildingId = assignment.buildingId;
          }
          const row = await trx
            .insertInto("site_views")
            .values({
              site_id: siteId,
              kind: "level",
              building_id: buildingId,
              label: checkedName(assignment.label, "label"),
              sort_order: await nextOrder(trx, "site_views", "building_id", buildingId),
              plan_id: planId,
              page_number: assignment.pageNumber,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          views.push(await viewOf(trx, row.id));
        }
        return views;
      });
    },
  };
}

export type SiteStructureRepository = ReturnType<typeof createSiteStructureRepository>;
