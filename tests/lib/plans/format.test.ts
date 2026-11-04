import { describe, expect, it } from "vitest";

import {
  choosePageFormat,
  pageTargetSize,
  pdfRenderScale,
  RENDER_SIDES,
  withRenderFallback,
} from "@/lib/plans/format";
import {
  MARKER_COORDINATE_DECIMALS,
  markersWithoutPhotoLabel,
  planNameFromFilename,
  roundCoordinate,
} from "@/server/domain/plans";

describe("choosePageFormat", () => {
  it("keeps PNG up to 8 MB and switches to JPEG above", () => {
    expect(choosePageFormat(1_000_000)).toBe("image/png");
    expect(choosePageFormat(8 * 1024 * 1024)).toBe("image/png");
    expect(choosePageFormat(8 * 1024 * 1024 + 1)).toBe("image/jpeg");
  });
});

describe("page sizes", () => {
  it("resizes a 5 000 × 3 500 PNG to 3 500 px keeping the ratio, never upscales", () => {
    expect(pageTargetSize({ width: 5000, height: 3500 })).toEqual({ width: 3500, height: 2450 });
    expect(pageTargetSize({ width: 1200, height: 800 })).toEqual({ width: 1200, height: 800 });
  });

  it("computes the PDF scale so that an A1 landscape page is 3 500 px wide", () => {
    // A1 landscape: 2 384 × 1 684 points.
    const scale = pdfRenderScale({ width: 2384, height: 1684 }, 3500);
    expect(Math.round(2384 * scale)).toBe(3500);
    expect(Math.round(1684 * scale)).toBe(2472);
  });
});

describe("withRenderFallback", () => {
  it("retries at 2 500 px after a failure at 3 500 px", async () => {
    const tried: number[] = [];
    const result = await withRenderFallback(async (side) => {
      tried.push(side);
      if (side === 3500) throw new Error("canvas too large");
      return `ok at ${side}`;
    });
    expect(tried).toEqual([...RENDER_SIDES]);
    expect(result).toBe("ok at 2500");
  });

  it("rethrows the second failure", async () => {
    await expect(
      withRenderFallback(async () => {
        throw new Error("out of memory");
      }),
    ).rejects.toThrow("out of memory");
  });
});

describe("plan domain helpers", () => {
  it("rounds coordinates to 5 decimals within 0..1", () => {
    expect(MARKER_COORDINATE_DECIMALS).toBe(5);
    expect(roundCoordinate(0.123456789)).toBe(0.12346);
    expect(roundCoordinate(-0.2)).toBe(0);
    expect(roundCoordinate(1.0000001)).toBe(1);
  });

  it("derives the plan name from the file name", () => {
    expect(planNameFromFilename("C:\\plans\\Plan_de_masse RDC.pdf")).toBe("Plan de masse RDC");
    expect(planNameFromFilename(".pdf")).toBe("Plan");
    expect(planNameFromFilename(`${"a".repeat(200)}.pdf`)).toHaveLength(120);
  });

  it("labels markers without photo", () => {
    expect(markersWithoutPhotoLabel(1)).toBe("1 repère sans photo");
    expect(markersWithoutPhotoLabel(2)).toBe("2 repères sans photo");
  });
});
