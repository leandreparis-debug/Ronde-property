import { describe, expect, it } from "vitest";

import { orientationSwapsSides, targetDimensions } from "@/lib/photos/resize";

describe("targetDimensions", () => {
  it("shrinks the longest side to the limit and keeps the ratio", () => {
    expect(targetDimensions({ width: 4000, height: 3000 }, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(targetDimensions({ width: 3000, height: 4000 }, 1600)).toEqual({
      width: 1200,
      height: 1600,
    });
    expect(targetDimensions({ width: 4000, height: 3000 }, 400)).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("never upscales", () => {
    expect(targetDimensions({ width: 800, height: 600 }, 1600)).toEqual({
      width: 800,
      height: 600,
    });
    expect(targetDimensions({ width: 1600, height: 1600 }, 1600)).toEqual({
      width: 1600,
      height: 1600,
    });
  });

  it("keeps every side at one pixel minimum and rounds", () => {
    expect(targetDimensions({ width: 10000, height: 1 }, 1600)).toEqual({ width: 1600, height: 1 });
    expect(targetDimensions({ width: 0, height: 0 }, 1600)).toEqual({ width: 1, height: 1 });
    expect(targetDimensions({ width: 1601, height: 1000 }, 1600)).toEqual({
      width: 1600,
      height: 999,
    });
  });
});

describe("orientationSwapsSides", () => {
  it("is true for the rotated orientations 5 to 8 only", () => {
    expect([1, 2, 3, 4].map(orientationSwapsSides)).toEqual([false, false, false, false]);
    expect([5, 6, 7, 8].map(orientationSwapsSides)).toEqual([true, true, true, true]);
    expect(orientationSwapsSides(undefined)).toBe(false);
  });
});
