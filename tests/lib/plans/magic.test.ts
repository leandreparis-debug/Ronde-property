import { describe, expect, it } from "vitest";

import { sniffPlanType } from "@/lib/plans/magic";

const text = (s: string) => new TextEncoder().encode(s);

describe("sniffPlanType", () => {
  it("recognises a PDF at byte 0 and after a few junk bytes", () => {
    expect(sniffPlanType(text("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffPlanType(new Uint8Array([0, 0, 0, ...text("%PDF-1.4")]))).toBe("application/pdf");
  });

  it("recognises PNG and JPEG at byte 0 only", () => {
    expect(sniffPlanType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      "image/png",
    );
    expect(sniffPlanType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffPlanType(new Uint8Array([0, 0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("refuses text named .pdf, a PDF signature beyond 1 024 bytes, GIF and empty input", () => {
    expect(sniffPlanType(text("Ceci n'est pas un PDF."))).toBeNull();
    expect(
      sniffPlanType(new Uint8Array([...new Uint8Array(1100), ...text("%PDF-1.7")])),
    ).toBeNull();
    expect(sniffPlanType(text("GIF89a"))).toBeNull();
    expect(sniffPlanType(new Uint8Array())).toBeNull();
    expect(sniffPlanType(text("%PDF"))).toBeNull();
  });
});
