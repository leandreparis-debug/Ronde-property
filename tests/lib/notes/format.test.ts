import { describe, expect, it } from "vitest";

import {
  insertBullets,
  isZoneFilled,
  NOTE_MAX_LENGTH,
  parseNoteContent,
  retryDelayMs,
} from "@/lib/notes/format";

describe("parseNoteContent", () => {
  it("returns no block for an empty or blank note", () => {
    expect(parseNoteContent("")).toEqual([]);
    expect(parseNoteContent("   \n\n  \t ")).toEqual([]);
  });

  it("groups consecutive bullets into one list", () => {
    expect(parseNoteContent("- Quai 14 : butoir arraché\n- Quai 15 : butoir fissuré")).toEqual([
      { type: "bullets", items: ["Quai 14 : butoir arraché", "Quai 15 : butoir fissuré"] },
    ]);
  });

  it("alternates paragraphs and bullet lists", () => {
    expect(
      parseNoteContent(
        "Étanchéité correcte.\nDeux lanterneaux à nettoyer.\n\n- Lanterneau 3\n- Lanterneau 7\n\nÀ revoir au printemps.",
      ),
    ).toEqual([
      { type: "paragraph", text: "Étanchéité correcte.\nDeux lanterneaux à nettoyer." },
      { type: "bullets", items: ["Lanterneau 3", "Lanterneau 7"] },
      { type: "paragraph", text: "À revoir au printemps." },
    ]);
  });

  it("does not treat « -5 °C », « -- » or « -texte » as bullets", () => {
    expect(parseNoteContent("-5 °C ce matin\n--\n-texte collé")).toEqual([
      { type: "paragraph", text: "-5 °C ce matin\n--\n-texte collé" },
    ]);
  });

  it("accepts « • » and « * » markers and leading spaces", () => {
    expect(parseNoteContent("  • Premier\n\t* Deuxième\n   -  Troisième")).toEqual([
      { type: "bullets", items: ["Premier", "Deuxième", "Troisième"] },
    ]);
  });

  it("accepts Windows line endings and normalises trailing spaces and repeated empty lines", () => {
    expect(parseNoteContent("Ligne 1   \r\n\r\n\r\n\r\n- Puce  \r\nLigne 2\r\n")).toEqual([
      { type: "paragraph", text: "Ligne 1" },
      { type: "bullets", items: ["Puce"] },
      { type: "paragraph", text: "Ligne 2" },
    ]);
  });

  it("ignores an empty bullet", () => {
    expect(parseNoteContent("- \n- Une seule")).toEqual([
      { type: "bullets", items: ["Une seule"] },
    ]);
  });

  it("handles 20 000 characters, accents and emojis", () => {
    const long = "é".repeat(NOTE_MAX_LENGTH);
    expect(parseNoteContent(long)).toEqual([{ type: "paragraph", text: long }]);
    expect(parseNoteContent("- Toiture OK ✅\n- Façade à repeindre 🎨")).toEqual([
      { type: "bullets", items: ["Toiture OK ✅", "Façade à repeindre 🎨"] },
    ]);
  });
});

describe("isZoneFilled", () => {
  it("is false for blank content and true otherwise", () => {
    expect(isZoneFilled("")).toBe(false);
    expect(isZoneFilled("  \n ")).toBe(false);
    expect(isZoneFilled("RAS.")).toBe(true);
  });
});

describe("insertBullets", () => {
  it("prefixes the current line and keeps the caret on the same characters", () => {
    const result = insertBullets({ text: "Toiture\nQuais", selectionStart: 10, selectionEnd: 10 });
    expect(result.text).toBe("Toiture\n- Quais");
    expect(result.selectionStart).toBe(12);
    expect(result.selectionEnd).toBe(12);
  });

  it("prefixes every selected line, skips those already bulleted and keeps the indent", () => {
    const text = "Un\n- Deux\n  Trois\nQuatre";
    const result = insertBullets({ text, selectionStart: 1, selectionEnd: text.length - 1 });
    expect(result.text).toBe("- Un\n- Deux\n  - Trois\n- Quatre");
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(text.length - 1 + 6);
  });

  it("works on an empty note", () => {
    expect(insertBullets({ text: "", selectionStart: 0, selectionEnd: 0 })).toEqual({
      text: "- ",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });
});

describe("retryDelayMs", () => {
  it("follows 1 s, 2 s, 5 s, 10 s then 30 s", () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([
      1000, 2000, 5000, 10_000, 30_000, 30_000,
    ]);
  });
});
