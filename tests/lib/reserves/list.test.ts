import { describe, expect, it } from "vitest";

import {
  countReserves,
  DEFAULT_RESERVE_FILTERS,
  filterReserves,
  hasActiveFilters,
  type ListableReserve,
  parseReserveFilters,
  plural,
  sortReserves,
  writeReserveFilters,
} from "@/lib/reserves/list";

function reserve(number: number, overrides: Partial<ListableReserve> = {}): ListableReserve {
  return {
    number,
    zoneKey: null,
    zoneLabel: null,
    priority: "normal",
    dueDate: null,
    status: "open",
    isOverdue: false,
    ...overrides,
  };
}

const ITEMS = [
  reserve(1, { priority: "high", dueDate: "2026-12-01", zoneKey: "roof", zoneLabel: "Toiture" }),
  reserve(2, {
    status: "in_progress",
    dueDate: "2026-11-20",
    zoneKey: "docks",
    zoneLabel: "Quais",
  }),
  reserve(3, { status: "done", priority: "low", dueDate: "2026-10-25" }),
  reserve(4, {
    priority: "urgent",
    dueDate: "2026-10-20",
    isOverdue: true,
    zoneKey: "docks",
    zoneLabel: "Quais",
  }),
  reserve(5, { dueDate: "2026-12-19" }),
  reserve(6, { priority: "urgent" }),
  reserve(7, { priority: "low", dueDate: "2026-11-01", isOverdue: true }),
];

const numbers = (items: ListableReserve[]) => items.map((item) => item.number);

describe("sortReserves", () => {
  it("puts overdue first, then priority, then the nearest due date, done last", () => {
    expect(numbers(sortReserves(ITEMS))).toEqual([4, 7, 6, 1, 2, 5, 3]);
  });

  it("sorts by number and by zone label (no zone last)", () => {
    expect(numbers(sortReserves(ITEMS, "number"))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(numbers(sortReserves(ITEMS, "zone"))).toEqual([2, 4, 1, 3, 5, 6, 7]);
  });
});

describe("filterReserves", () => {
  it("hides done reserves by default and shows them on demand", () => {
    expect(numbers(filterReserves(ITEMS, DEFAULT_RESERVE_FILTERS))).not.toContain(3);
    expect(
      numbers(filterReserves(ITEMS, { ...DEFAULT_RESERVE_FILTERS, showDone: true })),
    ).toContain(3);
  });

  it("filters by status (done shown even when hidden), priority, overdue and zone", () => {
    expect(numbers(filterReserves(ITEMS, { ...DEFAULT_RESERVE_FILTERS, status: "done" }))).toEqual([
      3,
    ]);
    expect(
      numbers(filterReserves(ITEMS, { ...DEFAULT_RESERVE_FILTERS, priority: "urgent" })),
    ).toEqual([4, 6]);
    expect(
      numbers(filterReserves(ITEMS, { ...DEFAULT_RESERVE_FILTERS, overdueOnly: true })),
    ).toEqual([4, 7]);
    expect(numbers(filterReserves(ITEMS, { ...DEFAULT_RESERVE_FILTERS, zone: "docks" }))).toEqual([
      2, 4,
    ]);
  });
});

describe("URL synchronisation", () => {
  it("round-trips the filters and keeps the other parameters", () => {
    const filters = {
      showDone: true,
      status: "open" as const,
      priority: "urgent" as const,
      overdueOnly: true,
      zone: "docks",
      sort: "zone" as const,
    };
    const params = writeReserveFilters(new URLSearchParams("onglet=reserves"), filters);
    expect(params.toString()).toBe(
      "onglet=reserves&levees=afficher&statut=open&priorite=urgent&retard=1&zone=docks&tri=zone",
    );
    expect(parseReserveFilters(params)).toEqual(filters);
  });

  it("omits the defaults and ignores unknown values", () => {
    const params = writeReserveFilters(
      new URLSearchParams("onglet=reserves&statut=open&tri=numero"),
      DEFAULT_RESERVE_FILTERS,
    );
    expect(params.toString()).toBe("onglet=reserves");
    expect(
      parseReserveFilters({ statut: "fermee", priorite: ["urgent", "low"], tri: "inconnu" }),
    ).toEqual({ ...DEFAULT_RESERVE_FILTERS, priority: "urgent" });
    expect(hasActiveFilters(DEFAULT_RESERVE_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_RESERVE_FILTERS, zone: "roof" })).toBe(true);
  });
});

describe("countReserves", () => {
  it("counts open, overdue and done reserves", () => {
    expect(countReserves(ITEMS)).toEqual({ open: 6, overdue: 2, done: 1 });
    expect(plural(1, "ouverte")).toBe("1 ouverte");
    expect(plural(3, "levée")).toBe("3 levées");
  });
});
