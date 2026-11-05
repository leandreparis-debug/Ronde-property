import { describe, expect, it } from "vitest";

import { csvCell, feedbackCsv } from "@/lib/feedback/csv";
import {
  DEFAULT_FEEDBACK_FILTERS,
  feedbackFiltersQuery,
  parseFeedbackFilters,
  periodStart,
} from "@/lib/feedback/list";
import { cleanPagePath, feedbackInputSchema } from "@/lib/feedback/schema";

describe("feedback input", () => {
  it("only requires the rating; empty texts become null", () => {
    const parsed = feedbackInputSchema.parse({
      rating: "4",
      works: "  ",
      blocks: "",
      pagePath: "/",
    });
    expect(parsed).toMatchObject({ rating: 4, works: null, blocks: null, pagePath: "/" });
  });

  it("refuses a missing or out-of-range rating", () => {
    for (const rating of [undefined, "", "0", "6", "2.5"]) {
      expect(feedbackInputSchema.safeParse({ rating }).success, String(rating)).toBe(false);
    }
  });

  it("keeps only the path of the page, and drops a malformed viewport", () => {
    expect(cleanPagePath("/visites/abc?onglet=notes#zone")).toBe("/visites/abc");
    expect(cleanPagePath("https://exemple.test/x")).toBe("/");
    expect(cleanPagePath("//exemple.test")).toBe("/");
    const parsed = feedbackInputSchema.parse({ rating: 3, viewport: "grand" });
    expect(parsed.viewport).toBeUndefined();
    expect(feedbackInputSchema.parse({ rating: 3, viewport: "768x1024" }).viewport).toBe(
      "768x1024",
    );
  });

  it("caps the texts at 2000 characters", () => {
    expect(feedbackInputSchema.safeParse({ rating: 3, blocks: "x".repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe("feedback filters", () => {
  it("round-trips through the URL and ignores invalid values", () => {
    const filters = parseFeedbackFilters({ note: "2", periode: "30", bloque: "1", page: "plans" });
    expect(filters).toEqual({ maxRating: 2, period: "30", blocksOnly: true, page: "plans" });
    expect(feedbackFiltersQuery(filters)).toBe("?note=2&periode=30&bloque=1&page=plans");
    expect(parseFeedbackFilters({ note: "9", periode: "hier", bloque: "oui" })).toEqual(
      DEFAULT_FEEDBACK_FILTERS,
    );
    expect(feedbackFiltersQuery(DEFAULT_FEEDBACK_FILTERS)).toBe("");
  });

  it("computes the start of the period", () => {
    const now = new Date("2026-11-05T10:00:00Z");
    expect(periodStart("7", now)?.toISOString()).toBe("2026-10-29T10:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
  });
});

describe("feedback CSV", () => {
  it("is Excel-ready: BOM, semicolons, CRLF, quoted cells, Paris time", () => {
    const csv = feedbackCsv([
      {
        id: "1",
        createdAt: new Date("2026-11-05T08:30:00Z"),
        authorName: "Alice Fictive",
        authorRole: "RT",
        rating: 2,
        works: 'Les "puces"',
        blocks: "Ligne 1\nLigne 2; suite",
        pagePath: "/visites/1",
        viewport: "768x1024",
        appVersion: "1.0.0",
      },
    ]);
    expect(csv.startsWith('﻿"Date";"Auteur"')).toBe(true);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"05/11/2026 09:30"');
    expect(lines[1]).toContain('"Les ""puces"""');
    expect(lines[1]).toContain('"Ligne 1\nLigne 2; suite"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("-2")).toBe(`"'-2"`);
    expect(csvCell(5)).toBe('"5"');
    expect(csvCell(null)).toBe('""');
  });
});
