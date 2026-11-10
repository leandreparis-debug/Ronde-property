import { describe, expect, it } from "vitest";

import {
  movePhotoSchema,
  photoPatchSchema,
  preparePhotoUploadSchema,
} from "@/server/photos/schemas";

const VISIT = "20000000-0000-4000-8000-000000000001";
const PHOTO = "60000000-0000-4000-8000-000000000001";

describe("preparePhotoUploadSchema", () => {
  const item = {
    originalFilename: "IMG_0001.jpg",
    width: 1600,
    height: 1200,
    sizeBytes: 120_000,
    thumbSizeBytes: 12_000,
    takenAt: "2026-05-04T08:00:00.000Z",
    zoneKey: "docks",
  };

  it("accepts a valid batch and defaults the optional fields", () => {
    const parsed = preparePhotoUploadSchema.parse({
      visitId: VISIT,
      items: [{ width: 10, height: 10, sizeBytes: 1, thumbSizeBytes: 1 }],
    });
    expect(parsed.items[0]).toEqual({
      originalFilename: null,
      width: 10,
      height: 10,
      sizeBytes: 1,
      thumbSizeBytes: 1,
      takenAt: null,
      zoneKey: null,
      toSort: false,
      hintViewId: null,
    });
  });

  it("refuses an empty batch, more than 50 items, a 4 MB+ image and bad dimensions", () => {
    expect(preparePhotoUploadSchema.safeParse({ visitId: VISIT, items: [] }).success).toBe(false);
    expect(
      preparePhotoUploadSchema.safeParse({ visitId: VISIT, items: Array(51).fill(item) }).success,
    ).toBe(false);
    const tooBig = preparePhotoUploadSchema.safeParse({
      visitId: VISIT,
      items: [{ ...item, sizeBytes: 4 * 1024 * 1024 + 1 }],
    });
    expect(tooBig.success).toBe(false);
    expect(!tooBig.success && tooBig.error.issues[0]?.message).toMatch(/4 Mo/);
    expect(
      preparePhotoUploadSchema.safeParse({ visitId: VISIT, items: [{ ...item, width: 0 }] })
        .success,
    ).toBe(false);
    expect(
      preparePhotoUploadSchema.safeParse({
        visitId: VISIT,
        items: [{ ...item, zoneKey: "Bad Key" }],
      }).success,
    ).toBe(false);
  });
});

describe("photoPatchSchema", () => {
  it("leaves absent fields undefined so that a partial patch never resets the others", () => {
    const parsed = photoPatchSchema.parse({ photoId: PHOTO, category: "defect" });
    expect(parsed).toEqual({ photoId: PHOTO, category: "defect" });
    expect("zoneKey" in parsed).toBe(false);
    expect("caption" in parsed).toBe(false);
  });

  it("accepts an explicit null zone and caption, and refuses unknown categories", () => {
    expect(photoPatchSchema.parse({ photoId: PHOTO, zoneKey: null, caption: null })).toEqual({
      photoId: PHOTO,
      zoneKey: null,
      caption: null,
    });
    expect(photoPatchSchema.safeParse({ photoId: PHOTO, category: "selfie" }).success).toBe(false);
    expect(photoPatchSchema.safeParse({ photoId: PHOTO, caption: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});

describe("movePhotoSchema", () => {
  it("accepts before / after only", () => {
    expect(movePhotoSchema.safeParse({ photoId: PHOTO, direction: "before" }).success).toBe(true);
    expect(movePhotoSchema.safeParse({ photoId: PHOTO, direction: "up" }).success).toBe(false);
  });
});
