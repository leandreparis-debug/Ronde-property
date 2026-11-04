import { describe, expect, it } from "vitest";

import {
  centerOn,
  clampScale,
  fitTransform,
  isTap,
  MAX_SCALE,
  panBy,
  relativeToScreen,
  screenToRelative,
  zoomAt,
} from "@/lib/plans/geometry";

const image = { width: 3500, height: 2475 };
const viewport = { width: 1000, height: 700 };

describe("fitTransform", () => {
  it("fits the whole page with a margin and centres it", () => {
    const t = fitTransform(image, viewport, 16);
    expect(t.scale).toBeCloseTo(Math.min(968 / 3500, 668 / 2475), 10);
    const topLeft = relativeToScreen({ x: 0, y: 0 }, t, image);
    const bottomRight = relativeToScreen({ x: 1, y: 1 }, t, image);
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(500, 6);
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(350, 6);
  });
});

describe("screenToRelative / relativeToScreen", () => {
  const transforms = [
    fitTransform(image, viewport),
    zoomAt(fitTransform(image, viewport), 3, { x: 200, y: 150 }, 0.2),
    panBy(zoomAt(fitTransform(image, viewport), 6.5, { x: 800, y: 600 }, 0.2), -1234, 987),
  ];

  it("round-trips at several zoom and pan levels", () => {
    for (const t of transforms) {
      for (const p of [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0.12345, y: 0.98765 },
        { x: 0.5, y: 0.25 },
      ]) {
        const screen = relativeToScreen(p, t, image);
        const back = screenToRelative(screen, t, image);
        expect(back!.x).toBeCloseTo(p.x, 9);
        expect(back!.y).toBeCloseTo(p.y, 9);
      }
    }
  });

  it("accepts the exact edges and refuses anything outside the page", () => {
    const t = transforms[0]!;
    const corner = relativeToScreen({ x: 1, y: 0 }, t, image);
    expect(screenToRelative(corner, t, image)).toEqual({ x: 1, y: 0 });
    expect(screenToRelative({ x: corner.x + 1, y: corner.y }, t, image)).toBeNull();
    const origin = relativeToScreen({ x: 0, y: 0 }, t, image);
    expect(screenToRelative({ x: origin.x, y: origin.y - 0.5 }, t, image)).toBeNull();
  });
});

describe("zoomAt", () => {
  it("keeps the image point under the zoom centre", () => {
    const t0 = fitTransform(image, viewport);
    const center = { x: 321, y: 456 };
    const before = screenToRelative(center, t0, image)!;
    const t1 = zoomAt(t0, 2.5, center, t0.scale);
    const after = screenToRelative(center, t1, image)!;
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(t1.scale).toBeCloseTo(t0.scale * 2.5, 9);
  });

  it("clamps between half the fit scale and the maximum scale", () => {
    const fit = 0.25;
    expect(clampScale(0.01, fit)).toBe(0.125);
    expect(clampScale(100, fit)).toBe(MAX_SCALE);
    const t = zoomAt({ scale: 7, tx: 0, ty: 0 }, 10, { x: 0, y: 0 }, fit);
    expect(t.scale).toBe(MAX_SCALE);
  });
});

describe("centerOn", () => {
  it("puts the relative point at the viewport centre", () => {
    const t = centerOn({ x: 0.8, y: 0.1 }, fitTransform(image, viewport), image, viewport, 1);
    const screen = relativeToScreen({ x: 0.8, y: 0.1 }, t, image);
    expect(screen.x).toBeCloseTo(500, 9);
    expect(screen.y).toBeCloseTo(350, 9);
    expect(t.scale).toBe(1);
  });
});

describe("isTap", () => {
  it("is a tap only for one short, still pointer", () => {
    expect(isTap({ pointers: 1, travel: 3, durationMs: 120 })).toBe(true);
    expect(isTap({ pointers: 2, travel: 0, durationMs: 120 })).toBe(false);
    expect(isTap({ pointers: 1, travel: 25, durationMs: 120 })).toBe(false);
    expect(isTap({ pointers: 1, travel: 2, durationMs: 1500 })).toBe(false);
  });
});
