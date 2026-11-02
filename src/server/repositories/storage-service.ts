export type StorageBucket = "visit-photos" | "site-plans" | "reports";

export interface UploadOptions {
  contentType: string;
  /** Replace an existing object at the same path. */
  upsert?: boolean;
}

/**
 * File storage behind the private buckets. V1 implementation: Supabase Storage with
 * short-lived signed URLs (step 7). V2: internal file server.
 */
export interface StorageService {
  upload(
    bucket: StorageBucket,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options: UploadOptions,
  ): Promise<{ path: string }>;
  /** Signed read URL valid for `expiresInSeconds` (default: a few minutes). */
  getSignedUrl(bucket: StorageBucket, path: string, expiresInSeconds?: number): Promise<string>;
  remove(bucket: StorageBucket, paths: string[]): Promise<void>;
}
