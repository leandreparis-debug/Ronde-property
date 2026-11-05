import { describe, expect, it } from "vitest";

import {
  DEFAULT_REPORT_OPTIONS,
  readReportOptions,
  reportOptionsSchema,
  summariseReportOptions,
} from "@/lib/report/options";

describe("report options", () => {
  it("defaults to every section, 4 photos per page, standard quality, done reserves hidden", () => {
    expect(DEFAULT_REPORT_OPTIONS).toEqual({
      sections: ["summary", "reserves", "notes", "plans", "annex"],
      includeDoneReserves: false,
      photosPerPage: 4,
      quality: "standard",
      coverPhotoId: null,
    });
  });

  it("orders the sections and refuses unknown values", () => {
    const parsed = reportOptionsSchema.parse({
      ...DEFAULT_REPORT_OPTIONS,
      sections: ["plans", "summary"],
    });
    expect(parsed.sections).toEqual(["summary", "plans"]);
    expect(
      reportOptionsSchema.safeParse({ ...DEFAULT_REPORT_OPTIONS, photosPerPage: 3 }).success,
    ).toBe(false);
    expect(
      reportOptionsSchema.safeParse({ ...DEFAULT_REPORT_OPTIONS, quality: "max" }).success,
    ).toBe(false);
  });

  it("reads the options of an earlier report, or falls back to the defaults", () => {
    expect(readReportOptions({ sections: ["information"], quality: "standard" })).toEqual(
      DEFAULT_REPORT_OPTIONS,
    );
    expect(readReportOptions({ ...DEFAULT_REPORT_OPTIONS, quality: "light" }).quality).toBe(
      "light",
    );
  });

  it("summarises the options for the history", () => {
    expect(
      summariseReportOptions({
        ...DEFAULT_REPORT_OPTIONS,
        includeDoneReserves: true,
        quality: "light",
      }),
    ).toBe(
      "Synthèse, Réserves (+ levées), Notes par zone, Plans, Annexe photos · 4 photos/page · Légère",
    );
    expect(summariseReportOptions({ ...DEFAULT_REPORT_OPTIONS, sections: [] })).toBe(
      "Couverture seule · 4 photos/page · Standard",
    );
  });
});
