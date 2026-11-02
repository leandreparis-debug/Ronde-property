import { describe, expect, it } from "vitest";

import {
  cleanText,
  mapHeaders,
  normalizeHeader,
  normalizePostalCode,
  normalizeRow,
  normalizeWarehouseCode,
  parseBoolean,
  parseNumber,
} from "@/server/sites/import/format";

describe("header aliases", () => {
  it("normalises headers regardless of case, accents, spaces and punctuation", () => {
    expect(normalizeHeader("Code entrepôt")).toBe("codeentrepot");
    expect(normalizeHeader("  SURFACE (m²) ")).toBe("surfacem2");
    expect(normalizeHeader("warehouse_code")).toBe("warehousecode");
  });

  it("maps known aliases, ignores unknown columns and reports missing required ones", () => {
    const mapping = mapHeaders([
      "Code Entrepot",
      "Nom du site",
      "Ville",
      "Commentaire",
      "Surface m2",
      "Actif",
    ]);
    expect(mapping.recognized.map((c) => c.field)).toEqual([
      "warehouse_code",
      "name",
      "city",
      "surface_m2",
      "is_active",
    ]);
    expect(mapping.ignored).toEqual(["Commentaire"]);
    expect(mapping.missingRequired).toEqual([]);
    expect(mapHeaders(["Ville", "Code"]).missingRequired).toEqual(["name"]);
  });

  it("keeps the first of two columns mapping to the same field", () => {
    const mapping = mapHeaders(["Code", "Code site", "Nom"]);
    expect(mapping.recognized.map((c) => c.header)).toEqual(["Code", "Nom"]);
    expect(mapping.ignored).toEqual(["Code site"]);
  });
});

describe("normalisations", () => {
  it("uppercases and strips codes", () => {
    expect(normalizeWarehouseCode(" test-018 ")).toBe("TEST-018");
    expect(normalizeWarehouseCode("")).toBeNull();
  });

  it("restores the leading zero of 4-digit postal codes", () => {
    expect(normalizePostalCode("1000")).toBe("01000");
    expect(normalizePostalCode("69800")).toBe("69800");
    expect(normalizePostalCode("69 800")).toBe("69800");
    expect(normalizePostalCode("")).toBeNull();
  });

  it("parses French and international numbers", () => {
    expect(parseNumber("12 500,50")).toBe(12500.5);
    expect(parseNumber("12500.50")).toBe(12500.5);
    expect(parseNumber("12.500,50")).toBe(12500.5);
    expect(parseNumber("12,500.50")).toBe(12500.5);
    expect(parseNumber("-4,49")).toBe(-4.49);
    expect(parseNumber("9 800 m²")).toBe(9800);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeUndefined();
  });

  it("parses booleans in French and English", () => {
    expect(parseBoolean("oui")).toBe(true);
    expect(parseBoolean("Actif")).toBe(true);
    expect(parseBoolean("1")).toBe(true);
    expect(parseBoolean("non")).toBe(false);
    expect(parseBoolean("INACTIF")).toBe(false);
    expect(parseBoolean("0")).toBe(false);
    expect(parseBoolean("")).toBeNull();
    expect(parseBoolean("peut-être")).toBeUndefined();
  });

  it("keeps formula-looking values as plain text", () => {
    expect(cleanText("=SUM(A1)")).toBe("=SUM(A1)");
    expect(cleanText("    ")).toBeNull();
  });
});

describe("normalizeRow", () => {
  it("builds a valid row", () => {
    const result = normalizeRow(2, {
      warehouse_code: "test-001",
      name: " Entrepôt fictif ",
      postal_code: "1000",
      surface_m2: "12 500,50",
      latitude: "45,7",
      is_active: "oui",
    });
    expect(result).toEqual({
      row: {
        line: 2,
        warehouseCode: "TEST-001",
        name: "Entrepôt fictif",
        address: null,
        postalCode: "01000",
        city: null,
        surfaceM2: 12500.5,
        category: null,
        latitude: 45.7,
        longitude: null,
        isActive: true,
      },
    });
  });

  it("reports every problem of an invalid row in French", () => {
    const result = normalizeRow(3, {
      warehouse_code: "",
      name: "",
      surface_m2: "-1",
      latitude: "95",
      postal_code: "123",
    });
    expect("errors" in result && result.errors.join(" ")).toMatch(/Code entrepôt manquant/);
    expect("errors" in result && result.errors.join(" ")).toMatch(/Nom manquant/);
    expect("errors" in result && result.errors.join(" ")).toMatch(/Surface négative/);
    expect("errors" in result && result.errors.join(" ")).toMatch(/Latitude hors bornes/);
    expect("errors" in result && result.errors.join(" ")).toMatch(/Code postal invalide/);
  });
});
