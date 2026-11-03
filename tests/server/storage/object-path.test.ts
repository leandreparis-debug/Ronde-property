import { describe, expect, it } from "vitest";

import { ValidationError } from "@/server/errors";
import { assertSafeObjectPath, isSafeObjectPath } from "@/server/storage/object-path";

describe("isSafeObjectPath", () => {
  it("accepts the photo and thumbnail paths", () => {
    expect(isSafeObjectPath("20000000-0000-4000-8000-000000000001/abc-123.jpg")).toBe(true);
    expect(isSafeObjectPath("20000000-0000-4000-8000-000000000001/abc-123_thumb.jpg")).toBe(true);
    expect(isSafeObjectPath("plans/site_01/plan-v2.pdf")).toBe(true);
  });

  it("refuses traversal, absolute paths, null bytes and odd characters", () => {
    for (const path of [
      "",
      "/etc/passwd",
      "../secret.jpg",
      "visit/../../secret.jpg",
      "visit/./a.jpg",
      "visit//a.jpg",
      "visit/a.jpg/",
      "visit/a\0.jpg",
      "visit\\a.jpg",
      "visit/a b.jpg",
      "visit/é.jpg",
      ".hidden/a.jpg",
      "visit/-a.jpg",
      "visit/a.jpg.meta.json",
      "a".repeat(600),
    ]) {
      expect(isSafeObjectPath(path), path).toBe(false);
    }
  });

  it("throws a ValidationError on an unsafe path", () => {
    expect(() => assertSafeObjectPath("../x")).toThrow(ValidationError);
    expect(() => assertSafeObjectPath("ok/x.jpg")).not.toThrow();
  });
});
