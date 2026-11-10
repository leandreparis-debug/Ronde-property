import { describe, expect, it } from "vitest";

import type { SiteBuildingView, SiteViewView } from "@/lib/plans/structure";
import {
  countsByBuilding,
  countsByView,
  createViewMemory,
  entryLevel,
  initialLocation,
  quickMenuPosition,
  screenOfTab,
  screenViews,
  tabOfScreen,
  thumbSide,
  visitFeed,
} from "@/lib/plans/visit-plan";

const building = (id: string, name: string, sortOrder: number): SiteBuildingView => ({
  id,
  siteId: "s",
  name,
  sortOrder,
  outline: null,
  isArchived: false,
});
const view = (
  id: string,
  kind: "exterior" | "level",
  buildingId: string | null,
  label: string,
  pageNumber: number,
  extra: Partial<SiteViewView> = {},
): SiteViewView => ({
  id,
  siteId: "s",
  kind,
  buildingId,
  label,
  sortOrder: pageNumber,
  planId: "plan",
  pageNumber,
  replacedBy: null,
  isArchived: false,
  ...extra,
});
const page = (pageNumber: number) => ({
  pageNumber,
  width: 3500,
  height: 2475,
  imageUrl: `/p${pageNumber}`,
  thumbUrl: null,
});

const buildings = [building("A", "Bâtiment A", 0), building("B", "Bâtiment B", 1)];
const views = [
  view("ext", "exterior", null, "Vue extérieure", 1),
  view("a0", "level", "A", "RDC", 2),
  view("b0", "level", "B", "RDC", 3),
  view("b1", "level", "B", "R+1", 4),
  view("old", "level", "B", "R+1", 5, { isArchived: true, replacedBy: "b1" }),
];
const pages = { plan: [1, 2, 3, 4, 5].map(page) };

describe("views of the plan screen", () => {
  it("shows the active views in order and keeps an archived one only if it carries markers", () => {
    const shown = screenViews({ views, buildings, pages, archivedPlanIds: new Set(), markers: [] });
    expect(shown.map((v) => v.view.id)).toEqual(["ext", "a0", "b0", "b1"]);
    const withOld = screenViews({
      views,
      buildings,
      pages,
      archivedPlanIds: new Set(),
      markers: [{ id: "m", planId: "plan", page: 5 }],
    });
    const old = withOld.find((v) => v.view.id === "old")!;
    expect(old).toMatchObject({ usable: false, badge: "Ancienne image" });
  });

  it("counts the entries per view and per building", () => {
    const markers = [
      { id: "1", planId: "plan", page: 3 },
      { id: "2", planId: "plan", page: 4 },
      { id: "3", planId: "plan", page: 4 },
      { id: "4", planId: "plan", page: 1 },
    ];
    const perView = countsByView(markers, views);
    expect(Object.fromEntries(perView)).toEqual({ b0: 1, b1: 2, ext: 1 });
    expect(Object.fromEntries(countsByBuilding(perView, views))).toEqual({ B: 3 });
  });

  it("opens on the exterior view, else the only level, else the list of the buildings", () => {
    const all = screenViews({ views, buildings, pages, archivedPlanIds: new Set(), markers: [] });
    expect(initialLocation(null, all, buildings)).toEqual({ kind: "view", viewId: "ext" });
    expect(initialLocation("b1", all, buildings)).toEqual({ kind: "view", viewId: "b1" });
    expect(initialLocation("batiment-B", all, buildings)).toEqual({
      kind: "building",
      buildingId: "B",
    });
    const noExterior = all.filter((v) => v.view.kind !== "exterior");
    expect(initialLocation(null, noExterior, buildings)).toEqual({ kind: "buildings" });
    const single = all.filter((v) => v.view.id === "a0");
    expect(initialLocation(null, single, buildings)).toEqual({ kind: "view", viewId: "a0" });
  });

  it("enters a building on its last level looked at during the visit, else the first", () => {
    const all = screenViews({ views, buildings, pages, archivedPlanIds: new Set(), markers: [] });
    expect(entryLevel("B", all, {})?.view.id).toBe("b0");
    expect(entryLevel("B", all, { B: "b1" })?.view.id).toBe("b1");
  });
});

describe("visit feed", () => {
  it("lists the latest entries of every view, the reserve once with its view", () => {
    const feed = visitFeed({
      views,
      buildings,
      markers: [
        {
          id: "m1",
          planId: "plan",
          page: 4,
          kind: "photo",
          label: "Fuite",
          number: null,
          createdAt: "2026-11-10T10:00:00Z",
          reserve: null,
        },
        {
          id: "m2",
          planId: "plan",
          page: 3,
          kind: "note",
          label: "Odeur de gaz",
          number: 2,
          createdAt: "2026-11-10T10:05:00Z",
          reserve: null,
        },
        {
          id: "m3",
          planId: "plan",
          page: 4,
          kind: "photo",
          label: null,
          number: 3,
          createdAt: "2026-11-10T10:02:00Z",
          reserve: { id: "r", code: "R-?", action: "Fuite" },
        },
      ],
      photos: [{ id: "p", caption: null, toSort: true, createdAt: "2026-11-10T10:06:00Z" }],
      reserves: [
        {
          id: "r",
          code: "R-?",
          action: "Fuite",
          createdAt: "2026-11-10T10:03:00Z",
          marker: { id: "m3" },
        },
      ],
    });
    expect(feed.map((e) => e.label)).toEqual([
      "Photo à ranger",
      "Note · Odeur de gaz · Bât. B RDC",
      "R-? · Fuite · Bât. B R+1",
      "Photo • · Fuite · Bât. B R+1",
    ]);
    expect(feed[2]).toMatchObject({ viewId: "b1", markerId: "m3" });
  });
});

describe("helpers", () => {
  it("remembers the zoom of each view", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    createViewMemory(storage, "k").set("b1", { scale: 2, tx: -10, ty: 5 });
    expect(createViewMemory(storage, "k").get("b1")).toEqual({ scale: 2, tx: -10, ty: 5 });
    expect(createViewMemory(storage, "k").get("ext")).toBeNull();
    expect(createViewMemory(null, "k").get("b1")).toBeNull();
  });

  it("redirects the former tabs to Plan, Liste or Rapport", () => {
    expect(screenOfTab(null)).toEqual({ screen: "plan", section: "information" });
    expect(screenOfTab("plans").screen).toBe("plan");
    expect(screenOfTab("photos")).toEqual({ screen: "liste", section: "photos" });
    expect(screenOfTab("information")).toEqual({ screen: "liste", section: "information" });
    expect(screenOfTab("report").screen).toBe("rapport");
    expect(tabOfScreen("liste", "notes")).toBe("notes");
    expect(tabOfScreen("plan")).toBeNull();
  });

  it("mirrors the thumb side for the left-handed", () => {
    expect(thumbSide(false)).toBe("right");
    expect(thumbSide(true)).toBe("left");
  });

  it("puts the quick menu above the point, below near the top, inside the canvas", () => {
    const canvas = { width: 400, height: 600 };
    const menu = { width: 200, height: 64 };
    expect(quickMenuPosition({ x: 200, y: 300 }, canvas, menu)).toEqual({ left: 100, top: 208 });
    expect(quickMenuPosition({ x: 390, y: 20 }, canvas, menu)).toEqual({ left: 192, top: 48 });
  });
});
