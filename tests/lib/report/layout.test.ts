import { describe, expect, it } from "vitest";

import {
  A4,
  chunk,
  contentBox,
  fitImage,
  MARGIN,
  markerBox,
  PDF_MARKER_SIZE,
  pageSize,
  photoCellSize,
  photoGrid,
  planOrientation,
} from "@/lib/report/layout";

describe("pages and margins", () => {
  it("uses A4 with 18 mm margins in both orientations", () => {
    expect(MARGIN).toBeCloseTo(51.02, 2);
    expect(pageSize("portrait")).toEqual({ width: A4.width, height: A4.height });
    expect(pageSize("landscape")).toEqual({ width: A4.height, height: A4.width });
    expect(contentBox("portrait").width).toBeCloseTo(A4.width - 2 * MARGIN, 5);
  });
});

describe("photo pages", () => {
  it("splits photos into pages of 2, 4 or 6", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 4)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
    expect(photoGrid(2)).toEqual({ columns: 1, rows: 2 });
    expect(photoGrid(4)).toEqual({ columns: 2, rows: 2 });
    expect(photoGrid(6)).toEqual({ columns: 2, rows: 3 });
  });

  it("sizes cells so that a whole page of photos fits the content box", () => {
    for (const perPage of [2, 4, 6] as const) {
      const cell = photoCellSize(perPage);
      const { columns, rows } = photoGrid(perPage);
      const box = contentBox("portrait");
      expect(cell.width * columns).toBeLessThanOrEqual(box.width);
      expect((cell.height + 30) * rows).toBeLessThanOrEqual(box.height);
    }
  });
});

describe("plans", () => {
  it("prints a wide plan in landscape and fits it without distortion", () => {
    expect(planOrientation(3500, 2475)).toBe("landscape");
    expect(planOrientation(2475, 3500)).toBe("portrait");
    const box = { left: 10, top: 20, width: 700, height: 400 };
    const fitted = fitImage({ width: 3500, height: 2475 }, box);
    expect(fitted.height).toBeCloseTo(400, 5);
    expect(fitted.width / fitted.height).toBeCloseTo(3500 / 2475, 5);
    expect(fitted.left).toBeGreaterThan(box.left);
  });

  it("converts relative coordinates to points, the pin point on the spot", () => {
    const image = { left: 100, top: 200, width: 400, height: 300 };
    const page = { width: A4.width, height: A4.height };
    const centre = markerBox({ x: 0.5, y: 0.5 }, image, page);
    expect(centre.anchorX).toBe(300);
    expect(centre.anchorY).toBe(350);
    expect(centre.left).toBe(300 - PDF_MARKER_SIZE / 2);
    expect(centre.top).toBe(350 - PDF_MARKER_SIZE);
  });

  it("keeps a marker on an edge (x = 0, x = 1, y = 0) entirely inside the page", () => {
    const page = { width: A4.height, height: A4.width };
    const image = { left: 0, top: 0, width: page.width, height: page.height };
    for (const point of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]) {
      const box = markerBox(point, image, page);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left + PDF_MARKER_SIZE).toBeLessThanOrEqual(page.width);
      expect(box.top + PDF_MARKER_SIZE).toBeLessThanOrEqual(page.height);
    }
  });
});
