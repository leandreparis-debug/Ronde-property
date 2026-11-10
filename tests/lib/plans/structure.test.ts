import { describe, expect, it } from "vitest";

import {
  buildingAt,
  orderViews,
  outlineCenter,
  outlineError,
  pointInPolygon,
  polygonArea,
  resolveZone,
  structureLabelError,
  viewShortTitle,
  viewTitle,
} from "@/lib/plans/structure";

const square = (x: number, y: number, size: number) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];

describe("outlines", () => {
  it("accepts a simple polygon and refuses fewer than 3 points, more than 24, outside, crossed", () => {
    expect(outlineError(square(0.1, 0.1, 0.3))).toBeNull();
    expect(outlineError(square(0.1, 0.1, 0.3).slice(0, 2))).toMatch(/au moins 3 points/);
    expect(
      outlineError(
        Array.from({ length: 25 }, (_, i) => ({
          x: 0.5 + 0.3 * Math.cos(i),
          y: 0.5 + 0.3 * Math.sin(i),
        })),
      ),
    ).toMatch(/au plus 24/);
    expect(
      outlineError([
        { x: 0.1, y: 0.1 },
        { x: 1.2, y: 0.1 },
        { x: 0.5, y: 0.5 },
      ]),
    ).toMatch(/sort de l'image/);
    // A bow tie: the 1st and 3rd edges cross.
    const bowTie = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.1 },
      { x: 0.1, y: 0.5 },
    ];
    expect(outlineError(bowTie)).toMatch(/se croise/);
    expect(
      outlineError([
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
      ]),
    ).toMatch(/plat/);
  });

  it("finds a point inside, on the edge, or outside", () => {
    const polygon = square(0.2, 0.2, 0.4);
    expect(pointInPolygon({ x: 0.4, y: 0.4 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 0.2, y: 0.3 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 0.7, y: 0.4 }, polygon)).toBe(false);
    expect(polygonArea(polygon)).toBeCloseTo(0.16);
    expect(outlineCenter(polygon)).toEqual({ x: 0.4, y: 0.4 });
  });

  it("gives the touch to the smallest outline when two overlap, ignores archived and untraced ones", () => {
    const big = { id: "A", outline: square(0.1, 0.1, 0.6), isArchived: false };
    const small = { id: "annexe", outline: square(0.3, 0.3, 0.1), isArchived: false };
    const archived = { id: "old", outline: square(0.32, 0.32, 0.02), isArchived: true };
    const untraced = { id: "B", outline: null, isArchived: false };
    const all = [big, small, archived, untraced];
    expect(buildingAt({ x: 0.35, y: 0.35 }, all)?.id).toBe("annexe");
    expect(buildingAt({ x: 0.15, y: 0.15 }, all)?.id).toBe("A");
    expect(buildingAt({ x: 0.9, y: 0.9 }, all)).toBeNull();
  });
});

describe("views", () => {
  const buildings = [
    { id: "b2", name: "Bâtiment B", sortOrder: 1 },
    { id: "b1", name: "Bâtiment A", sortOrder: 0 },
  ];
  const views = [
    { id: "r1b", kind: "level" as const, buildingId: "b2", sortOrder: 1, label: "R+1" },
    { id: "rdcA", kind: "level" as const, buildingId: "b1", sortOrder: 0, label: "RDC" },
    {
      id: "ext",
      kind: "exterior" as const,
      buildingId: null,
      sortOrder: 0,
      label: "Vue extérieure",
    },
    { id: "rdcB", kind: "level" as const, buildingId: "b2", sortOrder: 0, label: "RDC" },
  ];

  it("orders the exterior view, then each building, then its levels from the bottom up", () => {
    expect(orderViews(views, buildings).map((v) => v.id)).toEqual(["ext", "rdcA", "rdcB", "r1b"]);
  });

  it("titles a view « Bâtiment B · R+1 » and shortens it for the feed", () => {
    expect(viewTitle(views[0]!, buildings)).toBe("Bâtiment B · R+1");
    expect(viewTitle(views[2]!, buildings)).toBe("Vue extérieure");
    expect(viewShortTitle(views[0]!, buildings)).toBe("Bât. B R+1");
  });

  it("checks names and labels", () => {
    expect(structureLabelError("  ", "name")).toMatch(/nom/);
    expect(structureLabelError("x".repeat(61), "label")).toMatch(/60/);
    expect(structureLabelError(" Bâtiment   B ", "name")).toBeNull();
  });

  it("resolves no zone yet (extension point for the zones traced on the levels)", () => {
    expect(resolveZone("view", 0.5, 0.5)).toBeNull();
  });
});
