/**
 * Photo domain constants shared by the server, the browser pipeline and the interface.
 * No database access here.
 */

export const PHOTO_CATEGORIES = [
  "general",
  "defect",
  "equipment",
  "safety",
  "works",
  "other",
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

/** French labels of the categories, in display order. */
export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  general: "Vue générale",
  defect: "Désordre",
  equipment: "Équipement",
  safety: "Sécurité",
  works: "Travaux",
  other: "Autre",
};

export const DEFAULT_PHOTO_CATEGORY: PhotoCategory = "general";

/** Maximum number of photos of one visit (refused explicitly beyond). */
export const MAX_PHOTOS_PER_VISIT = 500;
/** Maximum size of one uploaded object (Vercel request limit, kept for consistency). */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** Longest side of the main JPEG and of the thumbnail, in pixels. */
export const PHOTO_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;
/** JPEG qualities of the main image and of the thumbnail. */
export const PHOTO_JPEG_QUALITY = 0.8;
export const THUMB_JPEG_QUALITY = 0.7;
/** Maximum length of a caption. */
export const PHOTO_CAPTION_MAX_LENGTH = 500;

/** True for a known category. */
export function isPhotoCategory(value: unknown): value is PhotoCategory {
  return typeof value === "string" && (PHOTO_CATEGORIES as readonly string[]).includes(value);
}

/** Label of a category; unknown or missing values fall back to the default category. */
export function photoCategoryLabel(category: string | null | undefined): string {
  return PHOTO_CATEGORY_LABELS[isPhotoCategory(category) ? category : DEFAULT_PHOTO_CATEGORY];
}

/** Message shown when a file is not a JPEG, PNG or WebP image. */
export const UNSUPPORTED_FORMAT_MESSAGE = "Format non pris en charge : utilisez JPEG, PNG ou WebP.";

/** Message shown when the compressed image is still above {@link MAX_PHOTO_BYTES}. */
export const TOO_LARGE_MESSAGE = "Image trop lourde après compression (4 Mo maximum).";

/**
 * Keeps a file name safe for storage and display: base name only, printable characters,
 * spaces collapsed, 255 characters maximum, extension preserved. Returns `null` when nothing
 * usable remains.
 */
export function sanitizeFilename(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop() ?? "";
  let cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  cleaned = cleaned.replace(/^\.+/, "");
  if (!cleaned) return null;
  if (cleaned.length <= 255) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 255 - extension.length) + extension;
}

/** Plural-aware « N photo(s) » label. */
export function photosCountLabel(count: number): string {
  return `${count} photo${count > 1 ? "s" : ""}`;
}

/** Label of the incomplete point about captions. */
export function uncaptionedLabel(count: number): string {
  return `${count} photo${count > 1 ? "s" : ""} sans légende`;
}
