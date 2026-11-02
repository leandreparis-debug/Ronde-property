import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ValidationError } from "@/server/errors";
import { decodeBuffer, parseSitesCsv } from "@/server/sites/import/parse";

const SAMPLE = readFileSync(path.join(process.cwd(), "docs/samples/sites-vigie-exemple.csv"));

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("decodeBuffer", () => {
  it("detects UTF-8 with BOM, plain UTF-8 and Windows-1252", () => {
    expect(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])).encoding).toBe("utf-8-bom");
    expect(decodeBuffer(utf8("Entrepôt")).encoding).toBe("utf-8");
    const cp1252 = decodeBuffer(new Uint8Array([0x4e, 0xee, 0x6d, 0x65, 0x73]));
    expect(cp1252.encoding).toBe("windows-1252");
    expect(cp1252.text).toBe("Nîmes");
  });
});

describe("parseSitesCsv", () => {
  it("parses the Windows-1252 sample with ; and keeps accents", () => {
    const result = parseSitesCsv(SAMPLE, "sites-vigie-exemple.csv");
    expect(result.encoding).toBe("windows-1252");
    expect(result.delimiter).toBe(";");
    expect(result.totalLines).toBe(15);
    expect(result.ignoredColumns).toEqual(["Commentaire"]);
    expect(result.recognizedColumns.map((c) => c.field)).toContain("surface_m2");
    expect(result.rows.find((r) => r.warehouseCode === "TEST-013")?.city).toBe("Nîmes");
    expect(result.rows.find((r) => r.warehouseCode === "TEST-014")?.postalCode).toBe("01000");
    expect(result.rows.find((r) => r.warehouseCode === "TEST-015")?.surfaceM2).toBe(12500.5);
    expect(result.errors.map((e) => e.line)).toEqual([10, 14, 15]);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("detects a comma delimiter and UTF-8", () => {
    const result = parseSitesCsv(utf8("Code,Nom,Ville\nA-1,Entrepôt Été,Nîmes\n"), "x.csv");
    expect(result.delimiter).toBe(",");
    expect(result.encoding).toBe("utf-8");
    expect(result.rows[0]).toMatchObject({
      warehouseCode: "A-1",
      name: "Entrepôt Été",
      city: "Nîmes",
    });
  });

  it.each([
    ["empty", "", /vide/],
    ["header only", "Code;Nom\n", /aucune ligne/],
    ["blank header", ";;\nA;B\n", /Colonnes obligatoires absentes/],
    ["missing name", "Code;Ville\nA;Lyon\n", /Colonnes obligatoires absentes : Nom/],
    ["binary", "Code;Nom\n\u0000\u0001\u0002", /pas un CSV texte/],
  ])("rejects a file: %s", (_label, content, message) => {
    expect(() => parseSitesCsv(utf8(content), "x.csv")).toThrow(ValidationError);
    expect(() => parseSitesCsv(utf8(content), "x.csv")).toThrow(message);
  });

  it("rejects a wrong extension, an oversized file and too many lines", () => {
    expect(() => parseSitesCsv(utf8("Code;Nom\nA;B\n"), "sites.xlsx")).toThrow(/\.csv ou \.txt/);
    expect(() => parseSitesCsv(new Uint8Array(4 * 1024 * 1024 + 1), "big.csv")).toThrow(/4 Mo/);
    const many = `Code;Nom\n${Array.from({ length: 5001 }, (_, i) => `C${i};N${i}`).join("\n")}\n`;
    expect(() => parseSitesCsv(utf8(many), "many.csv")).toThrow(/5000 lignes/);
  });
});
