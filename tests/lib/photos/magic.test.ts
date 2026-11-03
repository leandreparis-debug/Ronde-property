import { describe, expect, it } from "vitest";

import { isHeic, sniffImageType } from "@/lib/photos/magic";

function bytes(...values: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "string") out.push(...[...value].map((c) => c.charCodeAt(0)));
    else out.push(value);
  }
  return new Uint8Array(out);
}

describe("sniffImageType", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(
      "image/jpeg",
    );
    expect(sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d))).toBe(
      "image/png",
    );
    expect(sniffImageType(bytes("RIFF", 0x24, 0, 0, 0, "WEBP", "VP8 "))).toBe("image/webp");
  });

  it("refuses text pretending to be a JPEG, GIF, PDF, HEIC and truncated input", () => {
    expect(sniffImageType(bytes("ceci n'est pas une image"))).toBeNull();
    expect(sniffImageType(bytes("GIF89a", 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(sniffImageType(bytes("%PDF-1.7", 0, 0, 0, 0))).toBeNull();
    expect(sniffImageType(bytes(0, 0, 0, 0x18, "ftypheic"))).toBeNull();
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe("isHeic", () => {
  it("detects the HEIC and HEIF brands only", () => {
    expect(isHeic(bytes(0, 0, 0, 0x18, "ftypheic"))).toBe(true);
    expect(isHeic(bytes(0, 0, 0, 0x18, "ftypmif1"))).toBe(true);
    expect(isHeic(bytes(0, 0, 0, 0x18, "ftypisom"))).toBe(false);
    expect(isHeic(bytes(0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(false);
  });
});
