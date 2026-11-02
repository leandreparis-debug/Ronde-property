import { describe, expect, it } from "vitest";

import {
  customZoneKey,
  isTemplateZone,
  TECHNICAL_VISIT_ZONES,
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
  });

  it("builds a valid custom key from a French label", () => {
    expect(customZoneKey("Parking PL côté Sud")).toBe("custom-parking-pl-cote-sud");
    expect(customZoneKey("   ")).toBe("custom-zone");
    expect(customZoneKey("x".repeat(100))).toMatch(ZONE_KEY_PATTERN);
  });
});
