import { describe, expect, it } from "vitest";

import {
  participantInputSchema,
  planMarkerInputSchema,
  siteSchema,
  visitInputSchema,
  zoneNoteInputSchema,
} from "@/server/domain/schemas";

const SITE_ID = "10000000-0000-4000-8000-000000000001";

describe("visitInputSchema", () => {
  it("accepts a minimal visit and applies defaults", () => {
    const visit = visitInputSchema.parse({
      siteId: SITE_ID,
      title: "Visite périodique",
      visitDate: "2026-11-02",
    });
    expect(visit.type).toBe("technical");
    expect(visit.reason).toBe("periodic");
    expect(visit.subject).toBeNull();
    expect(visit.writerId).toBeNull();
  });

  it("rejects an empty title, a 201-character title and an invalid date", () => {
    expect(
      visitInputSchema.safeParse({ siteId: SITE_ID, title: "  ", visitDate: "2026-11-02" }).success,
    ).toBe(false);
    expect(
      visitInputSchema.safeParse({
        siteId: SITE_ID,
        title: "x".repeat(201),
        visitDate: "2026-11-02",
      }).success,
    ).toBe(false);
    expect(
      visitInputSchema.safeParse({
        siteId: SITE_ID,
        title: "x".repeat(200),
        visitDate: "2026-11-02",
      }).success,
    ).toBe(true);
    expect(
      visitInputSchema.safeParse({ siteId: SITE_ID, title: "Ok", visitDate: "02/11/2026" }).success,
    ).toBe(false);
    expect(
      visitInputSchema.safeParse({ siteId: "pas-un-uuid", title: "Ok", visitDate: "2026-11-02" })
        .success,
    ).toBe(false);
  });
});

describe("planMarkerInputSchema", () => {
  it("keeps coordinates between 0 and 1", () => {
    const base = { planId: SITE_ID, number: 1 };
    expect(planMarkerInputSchema.safeParse({ ...base, x: 0, y: 1 }).success).toBe(true);
    expect(planMarkerInputSchema.safeParse({ ...base, x: 1.5, y: 0.2 }).success).toBe(false);
    expect(planMarkerInputSchema.safeParse({ ...base, x: 0.2, y: -0.1 }).success).toBe(false);
  });
});

describe("zoneNoteInputSchema", () => {
  it("validates the zone key pattern and the content length", () => {
    expect(zoneNoteInputSchema.safeParse({ zoneKey: "roof", zoneLabel: "Toiture" }).success).toBe(
      true,
    );
    expect(
      zoneNoteInputSchema.safeParse({ zoneKey: "custom-parking", zoneLabel: "Parking" }).success,
    ).toBe(true);
    expect(
      zoneNoteInputSchema.safeParse({ zoneKey: "Toiture", zoneLabel: "Toiture" }).success,
    ).toBe(false);
    expect(
      zoneNoteInputSchema.safeParse({
        zoneKey: "roof",
        zoneLabel: "Toiture",
        content: "x".repeat(20_001),
      }).success,
    ).toBe(false);
  });
});

describe("participantInputSchema and siteSchema", () => {
  it("validates participant emails and site ranges", () => {
    expect(
      participantInputSchema.safeParse({ fullName: "Marc", email: "marc@example.test" }).success,
    ).toBe(true);
    expect(participantInputSchema.safeParse({ fullName: "Marc", email: "marc" }).success).toBe(
      false,
    );
    const site = {
      id: SITE_ID,
      warehouseCode: "TEST-001",
      name: "Entrepôt fictif",
      address: null,
      postalCode: null,
      city: "Lyon",
      surfaceM2: 42000,
      category: null,
      latitude: 45.7,
      longitude: 4.9,
      isActive: true,
      importedAt: "2026-11-02T10:00:00+01:00",
    };
    expect(siteSchema.safeParse(site).success).toBe(true);
    expect(siteSchema.safeParse({ ...site, surfaceM2: -1 }).success).toBe(false);
    expect(siteSchema.safeParse({ ...site, latitude: 91 }).success).toBe(false);
  });
});
