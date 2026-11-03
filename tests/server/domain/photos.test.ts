import { describe, expect, it } from "vitest";

import {
  DEFAULT_PHOTO_CATEGORY,
  isPhotoCategory,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  photoCategoryLabel,
  photosCountLabel,
  sanitizeFilename,
  uncaptionedLabel,
} from "@/server/domain/photos";

describe("photo categories", () => {
  it("lists the six categories with a French label each, general by default", () => {
    expect(PHOTO_CATEGORIES).toEqual([
      "general",
      "defect",
      "equipment",
      "safety",
      "works",
      "other",
    ]);
    expect(Object.keys(PHOTO_CATEGORY_LABELS).sort()).toEqual([...PHOTO_CATEGORIES].sort());
    expect(PHOTO_CATEGORY_LABELS.defect).toBe("Désordre");
    expect(DEFAULT_PHOTO_CATEGORY).toBe("general");
  });

  it("falls back to « Vue générale » for unknown or missing categories", () => {
    expect(photoCategoryLabel("safety")).toBe("Sécurité");
    expect(photoCategoryLabel(null)).toBe("Vue générale");
    expect(photoCategoryLabel("legacy")).toBe("Vue générale");
    expect(isPhotoCategory("works")).toBe(true);
    expect(isPhotoCategory("WORKS")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("keeps only the base name and removes control and reserved characters", () => {
    expect(sanitizeFilename("C:\\Users\\rt\\Photos\\IMG_0001.JPG")).toBe("IMG_0001.JPG");
    expect(sanitizeFilename("/tmp/../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename('quai <14>: "butoir"?.jpg')).toBe("quai 14 butoir.jpg");
    expect(sanitizeFilename("a\u0000b\nc.png")).toBe("abc.png");
    expect(sanitizeFilename("  plusieurs   espaces .webp ")).toBe("plusieurs espaces .webp");
    expect(sanitizeFilename("...caché.jpg")).toBe("caché.jpg");
  });

  it("returns null when nothing remains and truncates to 255 characters keeping the extension", () => {
    expect(sanitizeFilename("")).toBeNull();
    expect(sanitizeFilename(null)).toBeNull();
    expect(sanitizeFilename("<<<>>>")).toBeNull();
    const long = sanitizeFilename(`${"a".repeat(300)}.jpeg`)!;
    expect(long).toHaveLength(255);
    expect(long.endsWith(".jpeg")).toBe(true);
  });
});

describe("labels", () => {
  it("agrees in number", () => {
    expect(photosCountLabel(0)).toBe("0 photo");
    expect(photosCountLabel(1)).toBe("1 photo");
    expect(photosCountLabel(42)).toBe("42 photos");
    expect(uncaptionedLabel(1)).toBe("1 photo sans légende");
    expect(uncaptionedLabel(3)).toBe("3 photos sans légende");
  });
});
