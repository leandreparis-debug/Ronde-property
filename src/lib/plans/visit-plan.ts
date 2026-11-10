/**
 * Pure logic of the plan screen of a visit (step 12 b): which views are shown, counters per
 * view and per building, where the screen opens, the location in the URL, the visit feed,
 * the memory of the zoom per view, the redirection of the former tabs and the thumb side.
 */
import type { ViewTransform } from "./geometry";
import {
  orderViews,
  type SiteBuildingView,
  type SiteViewView,
  sortBuildings,
  viewShortTitle,
} from "./structure";

/** What the plan screen needs of a page: its size and image. */
export interface ScreenPage {
  pageNumber: number;
  width: number;
  height: number;
  imageUrl: string | null;
  thumbUrl: string | null;
}

/** A view the plan screen can show. */
export interface ScreenView {
  view: SiteViewView;
  page: ScreenPage;
  /** New markers allowed: active view, plan not archived. */
  usable: boolean;
  /** « Archivée » or « Ancienne image » for a view kept because it carries markers. */
  badge: "Archivée" | "Ancienne image" | null;
}

/** What the screen knows of a marker to place it on a view. */
export interface MarkerPlace {
  id: string;
  planId: string;
  page: number;
}

/** The view a marker belongs to: the active view of its page, else the archived one. */
export function viewIdOfMarker(marker: MarkerPlace, views: SiteViewView[]): string | null {
  const candidates = views.filter(
    (v) => v.planId === marker.planId && v.pageNumber === marker.page,
  );
  return (candidates.find((v) => !v.isArchived) ?? candidates[0])?.id ?? null;
}

/**
 * Views shown in the visit: the active ones whose page is available, plus the archived or
 * replaced ones that carry markers of this visit (badge), in the report order.
 */
export function screenViews(input: {
  views: SiteViewView[];
  buildings: SiteBuildingView[];
  pages: Record<string, ScreenPage[]>;
  archivedPlanIds: Set<string>;
  markers: MarkerPlace[];
}): ScreenView[] {
  const withMarkers = new Set(
    input.markers
      .map((marker) => viewIdOfMarker(marker, input.views))
      .filter((id): id is string => id !== null),
  );
  const archivedBuildings = new Set(input.buildings.filter((b) => b.isArchived).map((b) => b.id));
  const shown = input.views.filter(
    (view) =>
      (!view.isArchived && !archivedBuildings.has(view.buildingId ?? "")) ||
      withMarkers.has(view.id),
  );
  const result: ScreenView[] = [];
  for (const view of orderViews(shown, input.buildings)) {
    const page = input.pages[view.planId]?.find((p) => p.pageNumber === view.pageNumber);
    if (!page) continue;
    const archived = view.isArchived || archivedBuildings.has(view.buildingId ?? "");
    result.push({
      view,
      page,
      usable: !archived && !input.archivedPlanIds.has(view.planId),
      badge: archived ? (view.replacedBy ? "Ancienne image" : "Archivée") : null,
    });
  }
  return result;
}

/** Number of entries of the visit (markers) per view. */
export function countsByView(markers: MarkerPlace[], views: SiteViewView[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const marker of markers) {
    const id = viewIdOfMarker(marker, views);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Number of entries of the visit per building (sum of its levels). */
export function countsByBuilding(
  counts: Map<string, number>,
  views: SiteViewView[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const view of views) {
    if (!view.buildingId) continue;
    const n = counts.get(view.id) ?? 0;
    if (n > 0) result.set(view.buildingId, (result.get(view.buildingId) ?? 0) + n);
  }
  return result;
}

/** Where the plan screen is: a view, the list of the buildings, or the levels of a building. */
export type PlanLocation =
  | { kind: "view"; viewId: string }
  | { kind: "buildings" }
  | { kind: "building"; buildingId: string };

/** `?vue=` value of a location. */
export function locationParam(location: PlanLocation): string {
  if (location.kind === "view") return location.viewId;
  if (location.kind === "building") return `batiment-${location.buildingId}`;
  return "batiments";
}

/**
 * Where the screen opens: the location of the URL when it still exists, else the exterior view,
 * else the only level of the only building, else the list of the buildings.
 */
export function initialLocation(
  param: string | null,
  views: ScreenView[],
  buildings: SiteBuildingView[],
): PlanLocation {
  if (param === "batiments") return { kind: "buildings" };
  if (param?.startsWith("batiment-")) {
    const id = param.slice("batiment-".length);
    if (buildings.some((b) => b.id === id)) return { kind: "building", buildingId: id };
  }
  if (param && views.some((v) => v.view.id === param)) return { kind: "view", viewId: param };
  const exterior = views.find((v) => v.view.kind === "exterior" && v.usable);
  if (exterior) return { kind: "view", viewId: exterior.view.id };
  const levels = views.filter((v) => v.view.kind === "level" && v.usable);
  const withLevels = new Set(levels.map((v) => v.view.buildingId));
  if (withLevels.size === 1 && levels.length === 1) {
    return { kind: "view", viewId: levels[0]!.view.id };
  }
  return { kind: "buildings" };
}

/** Levels of a building shown in the visit, from the bottom up. */
export function levelsOf(buildingId: string, views: ScreenView[]): ScreenView[] {
  return views
    .filter((v) => v.view.buildingId === buildingId)
    .sort((a, b) => a.view.sortOrder - b.view.sortOrder);
}

/** Buildings shown: the ones with at least one level shown, in their order. */
export function screenBuildings(
  buildings: SiteBuildingView[],
  views: ScreenView[],
): SiteBuildingView[] {
  const used = new Set(views.map((v) => v.view.buildingId).filter(Boolean));
  return sortBuildings(buildings.filter((b) => used.has(b.id)));
}

/** The level a building opens on: the last one looked at during the visit, else the first. */
export function entryLevel(
  buildingId: string,
  views: ScreenView[],
  lastLevel: Record<string, string>,
): ScreenView | null {
  const levels = levelsOf(buildingId, views);
  const last = lastLevel[buildingId];
  return (
    levels.find((v) => v.view.id === last) ?? levels.find((v) => v.usable) ?? levels[0] ?? null
  );
}

/** One line of the visit feed. */
export interface FeedEntry {
  id: string;
  kind: "photo" | "note" | "reserve" | "to-sort";
  /** « R-? · Fuite · Bât. B R+1 ». */
  label: string;
  viewId: string | null;
  markerId: string | null;
  at: string;
}

/** Input of the feed: what the visit holds, already local. */
export interface FeedInput {
  markers: Array<
    MarkerPlace & {
      kind: "photo" | "note";
      label: string | null;
      number: number | null;
      createdAt: string;
      reserve: { id: string; code: string; action: string } | null;
    }
  >;
  photos: Array<{ id: string; caption: string | null; toSort: boolean; createdAt: string }>;
  reserves: Array<{
    id: string;
    code: string;
    action: string;
    createdAt: string;
    marker: { id: string } | null;
  }>;
  views: SiteViewView[];
  buildings: SiteBuildingView[];
}

/** The 20 latest entries of the visit, every view together, most recent first. */
export function visitFeed(input: FeedInput, limit = 20): FeedEntry[] {
  const title = (viewId: string | null) => {
    const view = input.views.find((v) => v.id === viewId);
    return view ? viewShortTitle(view, input.buildings) : null;
  };
  const entries: FeedEntry[] = [];
  const reserveMarker = new Set<string>();
  for (const reserve of input.reserves) {
    const marker = reserve.marker ? input.markers.find((m) => m.id === reserve.marker!.id) : null;
    if (marker) reserveMarker.add(marker.id);
    const viewId = marker ? viewIdOfMarker(marker, input.views) : null;
    entries.push({
      id: `reserve:${reserve.id}`,
      kind: "reserve",
      label: [reserve.code, reserve.action, title(viewId)].filter(Boolean).join(" · "),
      viewId,
      markerId: marker?.id ?? null,
      at: reserve.createdAt,
    });
  }
  for (const marker of input.markers) {
    if (marker.reserve || reserveMarker.has(marker.id)) continue;
    const viewId = viewIdOfMarker(marker, input.views);
    const text =
      marker.kind === "note"
        ? `Note · ${(marker.label ?? "").slice(0, 40)}`
        : `Photo ${marker.number ?? "•"}${marker.label ? ` · ${marker.label}` : ""}`;
    entries.push({
      id: `marker:${marker.id}`,
      kind: marker.kind === "note" ? "note" : "photo",
      label: [text, title(viewId)].filter(Boolean).join(" · "),
      viewId,
      markerId: marker.id,
      at: marker.createdAt,
    });
  }
  for (const photo of input.photos) {
    if (!photo.toSort) continue;
    entries.push({
      id: `photo:${photo.id}`,
      kind: "to-sort",
      label: `Photo à ranger${photo.caption ? ` · ${photo.caption}` : ""}`,
      viewId: null,
      markerId: null,
      at: photo.createdAt,
    });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/**
 * Memory of the zoom and position of each view during the visit (sessionStorage when
 * available): coming back to a view finds it as it was left.
 */
export function createViewMemory(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  key: string,
) {
  let cache: Record<string, ViewTransform> = {};
  try {
    cache = JSON.parse(storage?.getItem(key) ?? "{}") as Record<string, ViewTransform>;
  } catch {
    cache = {};
  }
  return {
    get(viewId: string): ViewTransform | null {
      return cache[viewId] ?? null;
    },
    set(viewId: string, transform: ViewTransform) {
      cache = { ...cache, [viewId]: transform };
      try {
        storage?.setItem(key, JSON.stringify(cache));
      } catch {
        // Storage full or blocked: the memory lasts as long as the page.
      }
    },
  };
}

/** Main entries of the visit page. */
export type VisitScreen = "plan" | "liste" | "rapport";
/** Sections of « Liste » (the former tabs). */
export type ListSection = "information" | "notes" | "reserves" | "photos";

/**
 * Reads `?onglet=` (former tab links stay valid): no value or « plans » → Plan; « report » →
 * Rapport; « liste », « information », « notes », « reserves », « photos » → Liste on that
 * section.
 */
export function screenOfTab(tab: string | null): { screen: VisitScreen; section: ListSection } {
  switch (tab) {
    case "report":
      return { screen: "rapport", section: "information" };
    case "liste":
    case "information":
      return { screen: "liste", section: "information" };
    case "notes":
    case "reserves":
    case "photos":
      return { screen: "liste", section: tab };
    default:
      return { screen: "plan", section: "information" };
  }
}

/** `?onglet=` value of a screen (and of a section of « Liste »). */
export function tabOfScreen(
  screen: VisitScreen,
  section: ListSection = "information",
): string | null {
  if (screen === "plan") return null;
  if (screen === "rapport") return "report";
  return section;
}

/** Side of the thumb: the main controls go there (bottom third), mirrored for the left-handed. */
export function thumbSide(leftHanded: boolean): "left" | "right" {
  return leftHanded ? "left" : "right";
}

/** Where to draw the quick menu: above the touched point, below it near the top edge. */
export function quickMenuPosition(
  point: { x: number; y: number },
  canvas: { width: number; height: number },
  menu: { width: number; height: number },
  gap = 28,
): { left: number; top: number } {
  const left = Math.min(
    Math.max(8, point.x - menu.width / 2),
    Math.max(8, canvas.width - menu.width - 8),
  );
  const above = point.y - gap - menu.height;
  const top =
    above >= 8 ? above : Math.min(point.y + gap, Math.max(8, canvas.height - menu.height - 8));
  return { left, top };
}
