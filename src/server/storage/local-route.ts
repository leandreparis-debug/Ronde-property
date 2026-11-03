import type { LocalStorageService } from "./local";
import { type SignedMethod, verifyLocalUrl } from "./local-signing";
import { isSafeObjectPath } from "./object-path";
import { isStorageBucket, type StorageBucket } from "./types";

/** Parsed target of a local storage request. */
export interface LocalTarget {
  bucket: StorageBucket;
  path: string;
}

/** Splits the catch-all segments into bucket and object path, or `null` when unsafe. */
export function parseLocalTarget(segments: readonly string[]): LocalTarget | null {
  const [bucket, ...rest] = segments;
  if (!bucket || !isStorageBucket(bucket) || rest.length === 0) return null;
  let objectPath: string;
  try {
    objectPath = rest.map((segment) => decodeURIComponent(segment)).join("/");
  } catch {
    return null;
  }
  if (!isSafeObjectPath(objectPath)) return null;
  return { bucket, path: objectPath };
}

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Media type of a `Content-Type` header, lower-cased, without parameters. */
export function mediaType(header: string | null): string {
  return (header ?? "").split(";")[0]!.trim().toLowerCase();
}

/**
 * Serves the local provider: `PUT` stores an object after checking the signature, the content
 * type and the size (atomic write); `GET` returns it with `Cache-Control: private, max-age=600`.
 * Refusals: 400 malformed, 403 bad signature, 410 expired, 413 too large, 415 wrong type.
 */
export async function serveLocalStorage(
  service: LocalStorageService,
  secret: string,
  request: Request,
  segments: readonly string[],
  now: Date = new Date(),
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== "PUT" && method !== "GET") return text(405, "Méthode non autorisée.");
  const target = parseLocalTarget(segments);
  if (!target) return text(400, "Chemin invalide.");

  const url = new URL(request.url);
  const verdict = verifyLocalUrl(
    secret,
    url.searchParams,
    { method: method as SignedMethod, bucket: target.bucket, path: target.path },
    now,
  );
  if (!verdict.ok) {
    if (verdict.reason === "expired") return text(410, "URL expirée.");
    if (verdict.reason === "signature") return text(403, "Signature invalide.");
    return text(400, "URL incomplète.");
  }

  if (method === "GET") {
    const object = await service.read(target.bucket, target.path);
    if (!object) return text(404, "Fichier introuvable.");
    return new Response(object.body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.body.byteLength),
        "Cache-Control": "private, max-age=600",
      },
    });
  }

  if (mediaType(request.headers.get("content-type")) !== verdict.contentType) {
    return text(415, "Type de contenu incorrect.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > verdict.maxBytes) {
    return text(413, "Fichier trop volumineux.");
  }
  const body = await readBody(request, verdict.maxBytes);
  if (body === "too-large") return text(413, "Fichier trop volumineux.");
  if (body.byteLength === 0) return text(400, "Fichier vide.");

  await service.write(target.bucket, target.path, body, verdict.contentType);
  return Response.json({ path: target.path, size: body.byteLength });
}

/** Reads the body up to `maxBytes`; stops and reports as soon as the limit is exceeded. */
async function readBody(request: Request, maxBytes: number): Promise<Uint8Array | "too-large"> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return "too-large";
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
