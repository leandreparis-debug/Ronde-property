import type { PhotoCategory } from "@/server/domain/photos";

/** A photo row as read from the database (ready or pending). */
export interface PhotoRecord {
  id: string;
  visitId: string;
  storagePath: string;
  thumbPath: string | null;
  originalFilename: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  caption: string | null;
  category: string | null;
  zoneKey: string | null;
  zoneLabel: string | null;
  /** Taken with the shutter, not placed yet (« À ranger », step 12 b). */
  toSort: boolean;
  /** View shown when it was taken: hint to place it. */
  hintViewId: string | null;
  takenAt: Date | null;
  sortOrder: number;
  isCover: boolean;
  uploadStatus: "pending" | "ready";
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What the browser needs to upload one prepared photo: two signed `PUT` targets. */
export interface PreparedPhotoUpload {
  photoId: string;
  main: { url: string; headers: Record<string, string>; expiresAt: string };
  thumb: { url: string; headers: Record<string, string>; expiresAt: string };
}

/** Serialisable photo for the interface, with its signed read URLs (10 minutes). */
export interface PhotoView {
  id: string;
  visitId: string;
  caption: string | null;
  category: PhotoCategory;
  zoneKey: string | null;
  zoneLabel: string | null;
  /** Taken with the shutter, not placed yet (« À ranger », step 12 b). */
  toSort: boolean;
  /** View shown when it was taken: hint to place it. */
  hintViewId: string | null;
  takenAt: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  sortOrder: number;
  isCover: boolean;
  originalFilename: string | null;
  createdByName: string | null;
  createdAt: string;
  /** Signed URL of the 1600 px image, `null` when the object is missing. */
  url: string | null;
  /** Signed URL of the 400 px thumbnail, `null` when the object is missing. */
  thumbUrl: string | null;
  /** When the signed URLs stop working (ISO 8601). */
  urlsExpireAt: string;
}

/** Fields the user can edit on a photo. */
export interface PhotoPatch {
  caption?: string | null;
  category?: PhotoCategory;
  zoneKey?: string | null;
  /** `false` once placed, kept without location or turned into a reserve. */
  toSort?: boolean;
}

/** Input of the preparation step, one entry per processed image. */
export interface PreparePhotoItem {
  /** Identifier chosen by the device (offline creation); the server generates one otherwise. */
  id?: string;
  originalFilename: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  thumbSizeBytes: number;
  takenAt: string | null;
  zoneKey: string | null;
  /** Taken with the shutter: goes to « À ranger » (step 12 b). */
  toSort?: boolean;
  hintViewId?: string | null;
}

/** Outcome of the confirmation step. */
export type ConfirmPhotoResult =
  { ok: true; photo: PhotoView } | { ok: false; error: string; retryable: boolean };
