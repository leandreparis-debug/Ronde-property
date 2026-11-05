import { describe, expect, it } from "vitest";

import { estimateStorage } from "../../scripts/ops/lib/storage-estimate.mjs";

describe("storage estimate", () => {
  it("adds photos, thumbnails and reports per month, plans once", () => {
    const e = estimateStorage({ rts: 10, visitsPerRtPerMonth: 6, sites: 80 });
    // 60 visits × 40 photos × 360 KB = 843.75 MB ; 60 × 1.5 × 12 MB = 1 080 MB.
    expect(e.visitsPerMonth).toBe(60);
    expect(e.photosGbPerMonth).toBe(0.8);
    expect(e.reportsGbPerMonth).toBe(1.1);
    expect(e.perMonthGb).toBe(1.9);
    expect(e.plansGb).toBe(1.2);
    expect(e.totalGb).toBe(23.7);
  });

  it("accepts other hypotheses and refuses negative numbers", () => {
    expect(
      estimateStorage({ rts: 1, visitsPerRtPerMonth: 1, photosPerVisit: 0, reportsPerVisit: 0 })
        .totalGb,
    ).toBe(0);
    expect(() => estimateStorage({ rts: -1, visitsPerRtPerMonth: 1 })).toThrow();
  });
});
