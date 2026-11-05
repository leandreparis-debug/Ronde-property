import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/server/db";
import { log } from "@/server/log";
import { createAdminSupabaseClient } from "@/server/supabase/admin";

import { assertSafeObjectPath } from "./object-path";
import {
  DOWNLOAD_NAME_PATTERN,
  type SignedReadOptions,
  type SignedUpload,
  type SignedUploadOptions,
  type StorageBucket,
  StorageError,
  type StorageObjectInfo,
  type StorageService,
} from "./types";

/** Validity of a Supabase signed upload token when it cannot be read from the token. */
const SUPABASE_UPLOAD_TOKEN_TTL_SECONDS = 2 * 60 * 60;

/**
 * Supabase Storage with the service role key (bypasses the storage policies): every caller
 * must have checked the user's right through a `withUser` query first. `server-only`.
 *
 * Upload URLs come from `createSignedUploadUrl` (browser `PUT`); their validity is fixed by
 * the storage API (two hours) and reported in `expiresAt`. The size limit is enforced by the
 * bucket (15 MB) and by the confirmation step, which compares `stat` to the declared size.
 */
export class SupabaseStorageService implements StorageService {
  private readonly client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database> = createAdminSupabaseClient()) {
    this.client = client;
  }

  async createSignedUpload(
    bucket: StorageBucket,
    path: string,
    options: SignedUploadOptions,
  ): Promise<SignedUpload> {
    assertSafeObjectPath(path);
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw fail("storage.signed_upload", error);
    return {
      url: data.signedUrl,
      headers: { "Content-Type": options.contentType, "x-upsert": "true" },
      expiresAt: tokenExpiry(data.token),
    };
  }

  async createSignedRead(
    bucket: StorageBucket,
    path: string,
    expiresInSeconds: number,
    options: SignedReadOptions = {},
  ): Promise<string> {
    assertSafeObjectPath(path);
    const download =
      options.downloadName && DOWNLOAD_NAME_PATTERN.test(options.downloadName)
        ? { download: options.downloadName }
        : undefined;
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds, download);
    if (error || !data) throw fail("storage.signed_read", error);
    return data.signedUrl;
  }

  async createSignedReads(
    bucket: StorageBucket,
    paths: string[],
    expiresInSeconds: number,
  ): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    for (const path of paths) assertSafeObjectPath(path);
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrls(paths, expiresInSeconds);
    if (error || !data) throw fail("storage.signed_reads", error);
    const urls: Record<string, string> = {};
    for (const entry of data) {
      if (entry.path && entry.signedUrl && !entry.error) urls[entry.path] = entry.signedUrl;
    }
    return urls;
  }

  async stat(bucket: StorageBucket, path: string): Promise<StorageObjectInfo | null> {
    assertSafeObjectPath(path);
    const { data, error } = await this.client.storage.from(bucket).info(path);
    if (error) {
      if (isNotFound(error)) return null;
      throw fail("storage.stat", error);
    }
    if (!data) return null;
    return { size: data.size ?? 0, contentType: data.contentType ?? "application/octet-stream" };
  }

  async remove(bucket: StorageBucket, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    for (const path of paths) assertSafeObjectPath(path);
    const { error } = await this.client.storage.from(bucket).remove(paths);
    if (error) throw fail("storage.remove", error);
  }
}

function fail(event: string, error: unknown): StorageError {
  log.error(event, { message: error instanceof Error ? error.message : String(error) });
  return new StorageError(undefined, { cause: error });
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { status, statusCode, message } = error as {
    status?: number;
    statusCode?: string | number;
    message?: string;
  };
  return (
    status === 404 ||
    status === 400 ||
    String(statusCode) === "404" ||
    String(statusCode) === "400" ||
    /not[_ ]found/i.test(message ?? "")
  );
}

/** Expiry of a signed upload token (a JWT with an `exp` claim), or the documented default. */
function tokenExpiry(token: string, now: Date = new Date()): Date {
  try {
    const payload = token.split(".")[1];
    if (payload) {
      const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        exp?: number;
      };
      if (typeof json.exp === "number") return new Date(json.exp * 1000);
    }
  } catch {
    // Not a JWT: fall back to the documented validity.
  }
  return new Date(now.getTime() + SUPABASE_UPLOAD_TOKEN_TTL_SECONDS * 1000);
}
