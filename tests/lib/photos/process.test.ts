import { describe, expect, it } from "vitest";

import { parseExifDate, PhotoProcessingError, readMagicBytes } from "@/lib/photos/process";

describe("parseExifDate", () => {
  it("parses the EXIF « YYYY:MM:DD HH:MM:SS » form as local time", () => {
    const iso = parseExifDate("2026:05:04 10:30:00");
    expect(iso).toBe(new Date(2026, 4, 4, 10, 30, 0).toISOString());
  });

  it("returns null for anything else", () => {
    expect(parseExifDate("")).toBeNull();
    expect(parseExifDate("04/05/2026")).toBeNull();
    expect(parseExifDate("0000:00:00 00:00:00")).not.toBeNull(); // JS normalises; not NaN
  });
});

describe("readMagicBytes", () => {
  it("reads the first twelve bytes only", async () => {
    const bytes = await readMagicBytes(new Blob([new Uint8Array(100).fill(7)]));
    expect(bytes).toHaveLength(12);
    expect(bytes[0]).toBe(7);
  });
});

describe("PhotoProcessingError", () => {
  it("carries the message to show", () => {
    const error = new PhotoProcessingError(
      "Format non pris en charge : utilisez JPEG, PNG ou WebP.",
    );
    expect(error.name).toBe("PhotoProcessingError");
    expect(error.message).toMatch(/JPEG, PNG ou WebP/);
  });
});
