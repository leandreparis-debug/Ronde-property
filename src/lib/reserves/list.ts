import type { ReservePriority, ReserveStatus } from "@/server/domain/enums";
import { RESERVE_PRIORITIES, RESERVE_STATUSES } from "@/server/domain/enums";

/** Fields of a reserve used to sort, filter and count the list. */
export interface ListableReserve {
  number: number;
  zoneKey: string | null;
  zoneLabel: string | null;
  priority: ReservePriority;
  dueDate: string | null;
  status: ReserveStatus;
  isOverdue: boolean;
}

/** Sorts offered in the Reserves tab. */
export const RESERVE_SORTS = [
  { key: "default", label: "Retard, priorité, échéance" },
  { key: "number", label: "Numéro" },
  { key: "zone", label: "Zone" },
] as const;
export type ReserveSort = (typeof RESERVE_SORTS)[number]["key"];

/** Filters of the Reserves tab, mirrored in the URL. */
export interface ReserveListFilters {
  /** « Masquer les levées » is on by default: `showDone` is false. */
  showDone: boolean;
  status: ReserveStatus | null;
  priority: ReservePriority | null;
  overdueOnly: boolean;
  zone: string | null;
  sort: ReserveSort;
}

export const DEFAULT_RESERVE_FILTERS: ReserveListFilters = {
  showDone: false,
  status: null,
  priority: null,
  overdueOnly: false,
  zone: null,
  sort: "default",
};

/** URL parameter names (French, readable in a shared link). */
export const RESERVE_FILTER_PARAMS = {
  showDone: "levees",
  status: "statut",
  priority: "priorite",
  overdueOnly: "retard",
  zone: "zone",
  sort: "tri",
} as const;

const SORT_PARAM: Record<ReserveSort, string | null> = {
  default: null,
  number: "numero",
  zone: "zone",
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string | null {
  if (source instanceof URLSearchParams) return source.get(name);
  const value = source[name];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Reads the filters from the URL; unknown values fall back to the defaults. */
export function parseReserveFilters(source: ParamSource): ReserveListFilters {
  const status = read(source, RESERVE_FILTER_PARAMS.status);
  const priority = read(source, RESERVE_FILTER_PARAMS.priority);
  const zone = read(source, RESERVE_FILTER_PARAMS.zone);
  const sortParam = read(source, RESERVE_FILTER_PARAMS.sort);
  const sort =
    (Object.entries(SORT_PARAM).find(([, value]) => value !== null && value === sortParam)?.[0] as
      ReserveSort | undefined) ?? "default";
  return {
    showDone: read(source, RESERVE_FILTER_PARAMS.showDone) === "afficher",
    status: (RESERVE_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as ReserveStatus)
      : null,
    priority: (RESERVE_PRIORITIES as readonly string[]).includes(priority ?? "")
      ? (priority as ReservePriority)
      : null,
    overdueOnly: read(source, RESERVE_FILTER_PARAMS.overdueOnly) === "1",
    zone: zone && zone.length <= 64 ? zone : null,
    sort,
  };
}

/**
 * Writes the filters into URL parameters, keeping the other parameters (tab, plan…) and
 * leaving out the default values so that the URL stays short.
 */
export function writeReserveFilters(
  base: URLSearchParams,
  filters: ReserveListFilters,
): URLSearchParams {
  const params = new URLSearchParams(base);
  const set = (name: string, value: string | null) => {
    if (value === null) params.delete(name);
    else params.set(name, value);
  };
  set(RESERVE_FILTER_PARAMS.showDone, filters.showDone ? "afficher" : null);
  set(RESERVE_FILTER_PARAMS.status, filters.status);
  set(RESERVE_FILTER_PARAMS.priority, filters.priority);
  set(RESERVE_FILTER_PARAMS.overdueOnly, filters.overdueOnly ? "1" : null);
  set(RESERVE_FILTER_PARAMS.zone, filters.zone);
  set(RESERVE_FILTER_PARAMS.sort, SORT_PARAM[filters.sort]);
  return params;
}

/** True when a filter other than the sort differs from the defaults. */
export function hasActiveFilters(filters: ReserveListFilters): boolean {
  return (
    filters.status !== null ||
    filters.priority !== null ||
    filters.overdueOnly ||
    filters.zone !== null
  );
}

/** Applies the filters. Choosing the status « Levée » shows done reserves even when hidden. */
export function filterReserves<T extends ListableReserve>(
  items: readonly T[],
  filters: ReserveListFilters,
): T[] {
  return items.filter((item) => {
    if (filters.status) {
      if (item.status !== filters.status) return false;
    } else if (!filters.showDone && item.status === "done") {
      return false;
    }
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.overdueOnly && !item.isOverdue) return false;
    if (filters.zone && item.zoneKey !== filters.zone) return false;
    return true;
  });
}

const PRIORITY_RANK: Record<ReservePriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function compareDue(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Default order: reserves not done first, among them the overdue ones, then priority
 * (urgent first), then the nearest due date (none last), then the number. « Numéro » and
 * « Zone » sort by number and by zone label (no zone last).
 */
export function sortReserves<T extends ListableReserve>(
  items: readonly T[],
  sort: ReserveSort = "default",
): T[] {
  const sorted = [...items];
  if (sort === "number") return sorted.sort((a, b) => a.number - b.number);
  if (sort === "zone") {
    return sorted.sort((a, b) => {
      const za = a.zoneLabel ?? a.zoneKey;
      const zb = b.zoneLabel ?? b.zoneKey;
      if (za !== zb) {
        if (za === null) return 1;
        if (zb === null) return -1;
        return za.localeCompare(zb, "fr");
      }
      return a.number - b.number;
    });
  }
  return sorted.sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      Number(b.isOverdue) - Number(a.isOverdue) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      compareDue(a.dueDate, b.dueDate) ||
      a.number - b.number,
  );
}

/** Counters of the tab: « N ouvertes · N en retard · N levées ». */
export function countReserves(items: readonly ListableReserve[]): {
  open: number;
  overdue: number;
  done: number;
} {
  let open = 0;
  let overdue = 0;
  let done = 0;
  for (const item of items) {
    if (item.status === "done") done += 1;
    else open += 1;
    if (item.isOverdue) overdue += 1;
  }
  return { open, overdue, done };
}

/**
 * Incomplete points of a visit related to its reserves not done: without responsible,
 * without due date, urgent without photo.
 */
export function reserveIncompleteCounts(
  items: readonly (ListableReserve & { responsibleKind: string | null; photosCount: number })[],
): { withoutResponsible: number; withoutDueDate: number; urgentWithoutPhoto: number } {
  const open = items.filter((item) => item.status !== "done");
  return {
    withoutResponsible: open.filter((item) => item.responsibleKind === null).length,
    withoutDueDate: open.filter((item) => item.dueDate === null).length,
    urgentWithoutPhoto: open.filter((item) => item.priority === "urgent" && item.photosCount === 0)
      .length,
  };
}

/** Reserves of one zone, not deleted: not done and done. */
export interface ZoneReserveCounts {
  open: number;
  done: number;
}

/**
 * Label of the reserves of a zone in the Notes tab: « 2 réserves ouvertes » while some are not
 * done, « 3 levées » when all are done, `null` when the zone has none.
 */
export function zoneReservesLabel(counts: ZoneReserveCounts): string | null {
  if (counts.open > 0) {
    return counts.open > 1 ? `${counts.open} réserves ouvertes` : "1 réserve ouverte";
  }
  if (counts.done > 0) return counts.done > 1 ? `${counts.done} levées` : "1 levée";
  return null;
}

/** Plural helper for the counters (« 1 ouverte », « 3 ouvertes »). */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
