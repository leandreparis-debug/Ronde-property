/**
 * Buildings and views of a site (step 12 b), shared by the server and the browser: outline
 * validation, hit testing on the exterior view, ordering of the views, labels, zone resolution.
 * Pure functions, no I/O.
 */

/** A point in coordinates relative to the image of a view (0 to 1 on both axes). */
export interface RelativePoint {
  x: number;
  y: number;
}

/** Kind of a view: the exterior view of the site or a level of a building. */
export type SiteViewKind = "exterior" | "level";

/** A building of a site, as the screens use it. */
export interface SiteBuildingView {
  id: string;
  siteId: string;
  name: string;
  sortOrder: number;
  /** Outline on the exterior view, `null` when not traced. */
  outline: RelativePoint[] | null;
  isArchived: boolean;
}

/** A view of a site: a page of a plan assigned to the exterior view or to a level. */
export interface SiteViewView {
  id: string;
  siteId: string;
  kind: SiteViewKind;
  buildingId: string | null;
  label: string;
  sortOrder: number;
  planId: string;
  pageNumber: number;
  /** View that replaced this one (new image of a level), `null` otherwise. */
  replacedBy: string | null;
  isArchived: boolean;
}

/** Outline limits, mirrored by the database (`private.is_valid_outline`). */
export const OUTLINE_MIN_POINTS = 3;
export const OUTLINE_MAX_POINTS = 24;
/** Name of a building and label of a view: 1 to 60 characters. */
export const STRUCTURE_LABEL_MAX = 60;

/** Labels offered for a level; any other text is accepted. */
export const LEVEL_SUGGESTIONS = ["Sous-sol", "RDC", "R+1", "R+2", "Mezzanine", "Toiture"] as const;

function cross(o: RelativePoint, a: RelativePoint, b: RelativePoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: RelativePoint, q: RelativePoint, r: RelativePoint): boolean {
  return (
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y)
  );
}

/** True when the segments [p1, p2] and [p3, p4] touch or cross. */
export function segmentsIntersect(
  p1: RelativePoint,
  p2: RelativePoint,
  p3: RelativePoint,
  p4: RelativePoint,
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  const EPS = 1e-12;
  if (Math.abs(d1) < EPS && onSegment(p3, p1, p4)) return true;
  if (Math.abs(d2) < EPS && onSegment(p3, p2, p4)) return true;
  if (Math.abs(d3) < EPS && onSegment(p1, p3, p2)) return true;
  if (Math.abs(d4) < EPS && onSegment(p1, p4, p2)) return true;
  return false;
}

/** Area of a polygon (absolute value of the shoelace formula). */
export function polygonArea(points: RelativePoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Checks an outline: 3 to 24 points inside the image, no edge crossing another (adjacent
 * edges share a corner), not flat. Returns the message to show, or `null` when valid.
 */
export function outlineError(points: RelativePoint[]): string | null {
  if (points.length < OUTLINE_MIN_POINTS) {
    return "Un contour a au moins 3 points : touchez les coins du bâtiment.";
  }
  if (points.length > OUTLINE_MAX_POINTS) {
    return `Un contour a au plus ${OUTLINE_MAX_POINTS} points.`;
  }
  if (points.some((p) => !(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1))) {
    return "Le contour sort de l'image.";
  }
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        return "Le contour se croise lui-même : déplacez ou retirez un point.";
      }
    }
  }
  if (polygonArea(points) < 1e-5) return "Le contour est trop petit ou tout plat.";
  return null;
}

/** True when the point lies inside the polygon (ray casting; edges count as inside). */
export function pointInPolygon(point: RelativePoint, polygon: RelativePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (Math.abs(cross(a, b, point)) < 1e-12 && onSegment(a, point, b)) {
      return true;
    }
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * The building touched on the exterior view: among the outlines that contain the point, the
 * **smallest** wins (an annex drawn inside or over a larger building stays reachable).
 */
export function buildingAt<T extends Pick<SiteBuildingView, "outline" | "isArchived">>(
  point: RelativePoint,
  buildings: T[],
): T | null {
  let best: T | null = null;
  let bestArea = Infinity;
  for (const building of buildings) {
    if (building.isArchived || !building.outline) continue;
    if (!pointInPolygon(point, building.outline)) continue;
    const area = polygonArea(building.outline);
    if (area < bestArea) {
      best = building;
      bestArea = area;
    }
  }
  return best;
}

/** Centre of an outline (mean of its corners), where its name and counter are drawn. */
export function outlineCenter(points: RelativePoint[]): RelativePoint {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Buildings in display order: by `sortOrder`, then name. */
export function sortBuildings<T extends Pick<SiteBuildingView, "sortOrder" | "name">>(
  buildings: T[],
): T[] {
  return [...buildings].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"),
  );
}

/**
 * Views in the order of the report and of the site tree: the exterior view, then each building
 * (in its order) with its levels from the bottom up.
 */
export function orderViews<
  V extends Pick<SiteViewView, "kind" | "buildingId" | "sortOrder" | "label">,
>(views: V[], buildings: Pick<SiteBuildingView, "id" | "sortOrder" | "name">[]): V[] {
  const rank = new Map(sortBuildings(buildings).map((b, index) => [b.id, index]));
  return [...views].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "exterior" ? -1 : 1;
    const ra = rank.get(a.buildingId ?? "") ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.buildingId ?? "") ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr");
  });
}

/** Title of a view: « Vue extérieure » or « Bâtiment B · R+1 ». */
export function viewTitle(
  view: Pick<SiteViewView, "kind" | "buildingId" | "label">,
  buildings: Pick<SiteBuildingView, "id" | "name">[],
): string {
  if (view.kind === "exterior") return "Vue extérieure";
  const building = buildings.find((b) => b.id === view.buildingId);
  return building ? `${building.name} · ${view.label}` : view.label;
}

/** Short form for the visit feed: « Bât. B R+1 ». */
export function viewShortTitle(
  view: Pick<SiteViewView, "kind" | "buildingId" | "label">,
  buildings: Pick<SiteBuildingView, "id" | "name">[],
): string {
  if (view.kind === "exterior") return "Extérieur";
  const building = buildings.find((b) => b.id === view.buildingId);
  if (!building) return view.label;
  return `${building.name.replace(/^Bâtiment\s+/i, "Bât. ")} ${view.label}`;
}

/**
 * Zone of the visit template at a point of a view. Extension point: returns `null` today; once
 * zones are traced on the levels (later step), it returns the key of the zone that contains the
 * point, and the sheets prefill it (docs/visit-on-plan.md).
 */
export function resolveZone(viewId: string, x: number, y: number): string | null {
  // No zone is traced on the levels yet: nothing to look up.
  void viewId;
  void x;
  void y;
  return null;
}

/** Normalises a name or a label: spaces collapsed, trimmed. */
export function cleanStructureLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Message for an invalid building name or view label, or `null`. */
export function structureLabelError(value: string, what: "name" | "label"): string | null {
  const clean = cleanStructureLabel(value);
  if (clean === "") {
    return what === "name" ? "Donnez un nom au bâtiment." : "Donnez un libellé à l'étage.";
  }
  if (clean.length > STRUCTURE_LABEL_MAX) return `${STRUCTURE_LABEL_MAX} caractères maximum.`;
  return null;
}
