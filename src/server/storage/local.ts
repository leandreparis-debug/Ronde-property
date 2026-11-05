import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat as fsStat, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildLocalUrl } from "./local-signing";
import { assertSafeObjectPath } from "./object-path";
import {
  type SignedUpload,
  DOWNLOAD_NAME_PATTERN,
  type SignedReadOptions,
  type SignedUploadOptions,
  type StorageBucket,
  StorageError,
  type StorageObjectInfo,
  type StorageService,
  UPLOAD_URL_TTL_SECONDS,
} from "./types";

export interface LocalStorageOptions {
  /** Root folder; one sub-folder per bucket. */
  dir: string;
  /** HMAC secret (32 characters minimum, validated by env.ts). */
  secret: string;
  /** Clock, replaceable in tests. */
  now?: () => Date;
}

interface Meta {
  contentType: string;
  size: number;
}

/**
 * Storage on the local file system, for tests and development only (`STORAGE_PROVIDER=local`).
 * Objects live under `dir/{bucket}/{path}` with a `{path}.meta.json` sidecar (content type,
 * size). URLs are root-relative, signed with HMAC-SHA256 and served by
 * `src/app/api/local-storage/[...path]/route.ts`.
 */
export class LocalStorageService implements StorageService {
  readonly dir: string;
  private readonly secret: string;
  private readonly now: () => Date;

  constructor(options: LocalStorageOptions) {
    this.dir = path.resolve(options.dir);
    this.secret = options.secret;
    this.now = options.now ?? (() => new Date());
  }

  async createSignedUpload(
    bucket: StorageBucket,
    objectPath: string,
    options: SignedUploadOptions,
  ): Promise<SignedUpload> {
    assertSafeObjectPath(objectPath);
    const ttl = options.expiresInSeconds ?? UPLOAD_URL_TTL_SECONDS;
    const expires = Math.floor(this.now().getTime() / 1000) + ttl;
    const url = buildLocalUrl(this.secret, {
      method: "PUT",
      bucket,
      path: objectPath,
      expires,
      maxBytes: options.maxBytes,
      contentType: options.contentType,
    });
    return {
      url,
      headers: { "Content-Type": options.contentType },
      expiresAt: new Date(expires * 1000),
    };
  }

  async createSignedRead(
    bucket: StorageBucket,
    objectPath: string,
    expiresInSeconds: number,
    options: SignedReadOptions = {},
  ): Promise<string> {
    assertSafeObjectPath(objectPath);
    const expires = Math.floor(this.now().getTime() / 1000) + expiresInSeconds;
    const url = buildLocalUrl(this.secret, {
      method: "GET",
      bucket,
      path: objectPath,
      expires,
      maxBytes: 0,
      contentType: "",
    });
    // The download name only changes a response header: checked by pattern, not signed.
    return options.downloadName && DOWNLOAD_NAME_PATTERN.test(options.downloadName)
      ? `${url}&dl=${encodeURIComponent(options.downloadName)}`
      : url;
  }

  async createSignedReads(
    bucket: StorageBucket,
    paths: string[],
    expiresInSeconds: number,
  ): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};
    for (const objectPath of paths) {
      if ((await this.stat(bucket, objectPath)) === null) continue;
      urls[objectPath] = await this.createSignedRead(bucket, objectPath, expiresInSeconds);
    }
    return urls;
  }

  async stat(bucket: StorageBucket, objectPath: string): Promise<StorageObjectInfo | null> {
    assertSafeObjectPath(objectPath);
    const file = this.resolve(bucket, objectPath);
    let size: number;
    try {
      size = (await fsStat(file)).size;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new StorageError(undefined, { cause: error });
    }
    const meta = await this.readMeta(file);
    return { size, contentType: meta?.contentType ?? "application/octet-stream" };
  }

  async remove(bucket: StorageBucket, paths: string[]): Promise<void> {
    for (const objectPath of paths) {
      assertSafeObjectPath(objectPath);
      const file = this.resolve(bucket, objectPath);
      try {
        await rm(file, { force: true });
        await rm(`${file}.meta.json`, { force: true });
      } catch (error) {
        throw new StorageError(undefined, { cause: error });
      }
    }
  }

  /** Writes an object atomically (temporary file then rename). Used by the local route. */
  async write(
    bucket: StorageBucket,
    objectPath: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    assertSafeObjectPath(objectPath);
    const file = this.resolve(bucket, objectPath);
    const folder = path.dirname(file);
    const suffix = randomBytes(6).toString("hex");
    const tmpFile = path.join(folder, `.${path.basename(file)}.${suffix}.tmp`);
    const tmpMeta = `${tmpFile}.meta`;
    try {
      await mkdir(folder, { recursive: true });
      await writeFile(tmpFile, body);
      const meta: Meta = { contentType, size: body.byteLength };
      await writeFile(tmpMeta, JSON.stringify(meta));
      await rename(tmpMeta, `${file}.meta.json`);
      await rename(tmpFile, file);
    } catch (error) {
      await rm(tmpFile, { force: true }).catch(() => undefined);
      await rm(tmpMeta, { force: true }).catch(() => undefined);
      throw new StorageError(undefined, { cause: error });
    }
  }

  /** Reads an object with its content type, or `null` when it does not exist. */
  async read(
    bucket: StorageBucket,
    objectPath: string,
  ): Promise<{ body: Uint8Array; contentType: string } | null> {
    assertSafeObjectPath(objectPath);
    const file = this.resolve(bucket, objectPath);
    try {
      const body = await readFile(file);
      const meta = await this.readMeta(file);
      return { body, contentType: meta?.contentType ?? "application/octet-stream" };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new StorageError(undefined, { cause: error });
    }
  }

  /** Absolute file path, guaranteed to stay under `dir/{bucket}`. */
  private resolve(bucket: StorageBucket, objectPath: string): string {
    const root = path.join(this.dir, bucket);
    const file = path.resolve(root, objectPath);
    if (file !== root && !file.startsWith(root + path.sep)) {
      throw new StorageError("Chemin de fichier invalide.");
    }
    return file;
  }

  private async readMeta(file: string): Promise<Meta | null> {
    try {
      const raw = await readFile(`${file}.meta.json`, "utf8");
      const parsed = JSON.parse(raw) as Partial<Meta>;
      if (typeof parsed.contentType !== "string" || typeof parsed.size !== "number") return null;
      return { contentType: parsed.contentType, size: parsed.size };
    } catch {
      return null;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
