import { describe, expect, it } from "vitest";

import {
  customZoneKey,
  isTemplateZone,
  MEETING_ZONES,
  normalizeZoneLabel,
  TECHNICAL_VISIT_ZONES,
  templateForVisitType,
  ZONE_KEY_PATTERN,
} from "@/server/domain/templates";

describe("technical visit template", () => {
  it("has nine zones with unique valid keys and labels", () => {
    expect(TECHNICAL_VISIT_ZONES).toHaveLength(9);
    const keys = TECHNICAL_VISIT_ZONES.map((zone) => zone.key);
    expect(new Set(keys).size).toBe(9);
    for (const zone of TECHNICAL_VISIT_ZONES) {
      expect(zone.key).toMatch(ZONE_KEY_PATTERN);
      expect(zone.label).toMatch(/\S/);
    }
    expect(keys[0]).toBe("roof");
    expect(keys[8]).toBe("fire_safety");
  });

  it("distinguishes template zones from custom zones", () => {
    expect(isTemplateZone("docks")).toBe(true);
    expect(isTemplateZone("custom-parking")).toBe(false);
    expect(isTemplateZone("agenda")).toBe(false);
    expect(isTemplateZone("agenda", "meeting")).toBe(true);
  });
});

describe("meeting template (provisional)", () => {
  it("has agenda, discussion and decisions, and is chosen for meetings", () => {
    expect(MEETING_ZONES.map((zone) => zone.key)).toEqual(["agenda", "discussion", "decisions"]);
    expect(templateForVisitType("meeting").name).toBe("réunion");
    expect(templateForVisitType("technical").zones).toBe(TECHNICAL_VISIT_ZONES);
  });
});

describe("custom zone keys", () => {
  it("builds a valid custom key from a French label", () => {
    expect(customZoneKey("Parking PL côté Sud")).toBe("custom-parking-pl-cote-sud");
    expect(customZoneKey("   ")).toBe("custom-zone");
    expect(customZoneKey("x".repeat(100))).toMatch(ZONE_KEY_PATTERN);
  });

  it("appends the short suffix and keeps the key within 64 characters", () => {
    expect(customZoneKey("Local sprinkler", "k7f2")).toBe("custom-local-sprinkler-k7f2");
    const long = customZoneKey("Zone ".repeat(40), "ab12");
    expect(long).toMatch(ZONE_KEY_PATTERN);
    expect(long.endsWith("-ab12")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(64);
  });

  it("normalises labels for duplicate detection", () => {
    expect(normalizeZoneLabel("  Local   Sprinkler ")).toBe("local sprinkler");
    expect(normalizeZoneLabel("Électricité")).toBe(normalizeZoneLabel("electricite"));
  });
});
