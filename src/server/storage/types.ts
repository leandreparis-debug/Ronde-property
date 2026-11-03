import { AppError } from "@/server/errors";

/** Private buckets created by migration 7. */
export const STORAGE_BUCKETS = ["visit-photos", "site-plans", "reports"] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

/** Content types accepted by the buckets (migration 7). */
export type StorageContentType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** Default validity of an upload URL: two minutes. */
export const UPLOAD_URL_TTL_SECONDS = 120;
/** Default validity of a read URL: ten minutes. */
export const READ_URL_TTL_SECONDS = 600;

export interface SignedUploadOptions {
  contentType: StorageContentType;
  /** Maximum accepted size of the object, in bytes. */
  maxBytes: number;
  /** Validity of the URL, in seconds (default {@link UPLOAD_URL_TTL_SECONDS}). */
  expiresInSeconds?: number;
}

/** Everything the browser needs to `PUT` the file: URL, headers to send and expiry. */
export interface SignedUpload {
  /** Absolute URL (Supabase) or root-relative URL (local provider). */
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StorageObjectInfo {
  size: number;
  contentType: string;
}

/**
 * File storage behind the private buckets, selected by `STORAGE_PROVIDER`.
 *
 * Both implementations bypass the storage access rules (service role key, or local files):
 * **no signed URL is ever delivered without a prior right check through `withUser`**. Upload
 * URLs are only created after a `photos` row was inserted under RLS; read URLs only for rows
 * the user can read.
 */
export interface StorageService {
  /** Signed URL for a direct `PUT` from the browser. */
  createSignedUpload(
    bucket: StorageBucket,
    path: string,
    options: SignedUploadOptions,
  ): Promise<SignedUpload>;
  /** Signed read URL valid for `expiresInSeconds`. */
  createSignedRead(bucket: StorageBucket, path: string, expiresInSeconds: number): Promise<string>;
  /** Signed read URLs in one call, keyed by path. Missing objects are left out. */
  createSignedReads(
    bucket: StorageBucket,
    paths: string[],
    expiresInSeconds: number,
  ): Promise<Record<string, string>>;
  /** Size and content type of an object, or `null` when it does not exist. */
  stat(bucket: StorageBucket, path: string): Promise<StorageObjectInfo | null>;
  /** Removes objects; missing ones are ignored. */
  remove(bucket: StorageBucket, paths: string[]): Promise<void>;
}

/** The storage backend refused or failed; the user gets a generic message. */
export class StorageError extends AppError {
  constructor(
    message = "Le stockage des fichiers est indisponible. Réessayez dans un instant.",
    options?: { cause?: unknown },
  ) {
    super(message, 502, options);
  }
}

/** True for a bucket name created by migration 7. */
export function isStorageBucket(value: string): value is StorageBucket {
  return (STORAGE_BUCKETS as readonly string[]).includes(value);
}
