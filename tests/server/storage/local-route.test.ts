// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalStorageService } from "@/server/storage/local";
import { mediaType, parseLocalTarget, serveLocalStorage } from "@/server/storage/local-route";
import { buildLocalUrl, type SignatureInput } from "@/server/storage/local-signing";

const SECRET = "route-secret-with-at-least-32-characters-0000";
const NOW = new Date("2026-11-03T10:00:00Z");
const EXPIRES = Math.floor(NOW.getTime() / 1000) + 120;
const BODY = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

let dir = "";
let service: LocalStorageService;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-route-"));
  service = new LocalStorageService({ dir, secret: SECRET, now: () => NOW });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const putInput: SignatureInput = {
  method: "PUT",
  bucket: "visit-photos",
  path: "visit-1/photo.jpg",
  expires: EXPIRES,
  maxBytes: 16,
  contentType: "image/jpeg",
};

function request(url: string, init?: RequestInit): Request {
  return new Request(`http://ronde.test${url}`, init);
}

function segmentsOf(url: string): string[] {
  return new URL(`http://ronde.test${url}`).pathname.replace("/api/local-storage/", "").split("/");
}

async function serve(url: string, init?: RequestInit, now = NOW): Promise<Response> {
  return serveLocalStorage(service, SECRET, request(url, init), segmentsOf(url), now);
}

describe("parseLocalTarget", () => {
  it("accepts a known bucket and a safe path", () => {
    expect(parseLocalTarget(["visit-photos", "visit-1", "photo.jpg"])).toEqual({
      bucket: "visit-photos",
      path: "visit-1/photo.jpg",
    });
  });

  it("refuses unknown buckets, traversal, absolute and encoded tricks", () => {
    expect(parseLocalTarget(["avatars", "a.jpg"])).toBeNull();
    expect(parseLocalTarget(["visit-photos"])).toBeNull();
    expect(parseLocalTarget(["visit-photos", "..", "a.jpg"])).toBeNull();
    expect(parseLocalTarget(["visit-photos", "%2e%2e", "a.jpg"])).toBeNull();
    expect(parseLocalTarget(["visit-photos", "a%00.jpg"])).toBeNull();
    expect(parseLocalTarget(["visit-photos", "", "a.jpg"])).toBeNull();
    expect(parseLocalTarget(["visit-photos", "%E0%A4%A"])).toBeNull();
  });
});

describe("mediaType", () => {
  it("keeps the media type only", () => {
    expect(mediaType("Image/JPEG; charset=binary")).toBe("image/jpeg");
    expect(mediaType(null)).toBe("");
  });
});

describe("serveLocalStorage", () => {
  it("stores a valid PUT atomically and serves it back with a private cache header", async () => {
    const url = buildLocalUrl(SECRET, putInput);
    const put = await serve(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: BODY,
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ path: "visit-1/photo.jpg", size: BODY.byteLength });
    const files = await readdir(path.join(dir, "visit-photos", "visit-1"));
    expect(files.sort()).toEqual(["photo.jpg", "photo.jpg.meta.json"]);

    const getUrl = buildLocalUrl(SECRET, {
      ...putInput,
      method: "GET",
      maxBytes: 0,
      contentType: "",
    });
    const get = await serve(getUrl);
    expect(get.status).toBe(200);
    expect(get.headers.get("cache-control")).toBe("private, max-age=600");
    expect(get.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(BODY);
  });

  it("refuses a forged signature (403) and an expired URL (410)", async () => {
    const url = buildLocalUrl(SECRET, putInput).replace(
      /sig=[0-9a-f]{64}/,
      `sig=${"f".repeat(64)}`,
    );
    const forged = await serve(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: BODY,
    });
    expect(forged.status).toBe(403);

    const expired = await serve(
      buildLocalUrl(SECRET, putInput),
      { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: BODY },
      new Date((EXPIRES + 1) * 1000),
    );
    expect(expired.status).toBe(410);
  });

  it("refuses a wrong Content-Type (415) and a body above the signed size (413)", async () => {
    const url = buildLocalUrl(SECRET, { ...putInput, path: "visit-1/other.jpg" });
    const wrongType = await serve(url, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: BODY,
    });
    expect(wrongType.status).toBe(415);

    const tooLarge = await serve(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array(17),
    });
    expect(tooLarge.status).toBe(413);

    const declared = await serve(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": "1000" },
      body: BODY,
    });
    expect(declared.status).toBe(413);
    expect(await service.stat("visit-photos", "visit-1/other.jpg")).toBeNull();
  });

  it("refuses an empty body (400), a missing object (404) and other methods (405)", async () => {
    const url = buildLocalUrl(SECRET, { ...putInput, path: "visit-1/empty.jpg" });
    const empty = await serve(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(empty.status).toBe(400);

    const getUrl = buildLocalUrl(SECRET, {
      ...putInput,
      method: "GET",
      path: "visit-1/missing.jpg",
      maxBytes: 0,
      contentType: "",
    });
    expect((await serve(getUrl)).status).toBe(404);
    expect((await serve(getUrl, { method: "DELETE" })).status).toBe(405);
  });

  it("refuses traversal and unknown buckets before checking anything else (400)", async () => {
    const sig = buildLocalUrl(SECRET, putInput).split("?")[1]!;
    for (const url of [
      `/api/local-storage/visit-photos/..%2F..%2Fetc%2Fpasswd?${sig}`,
      `/api/local-storage/visit-photos/%2Fetc%2Fpasswd?${sig}`,
      `/api/local-storage/secrets/x.jpg?${sig}`,
      `/api/local-storage/visit-photos/a%00.jpg?${sig}`,
    ]) {
      const response = await serve(url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: BODY,
      });
      expect(response.status, url).toBe(400);
    }
  });
});
