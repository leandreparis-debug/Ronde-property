// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalStorageService } from "@/server/storage/local";
import { serveLocalStorage } from "@/server/storage/local-route";
import { LOCAL_STORAGE_ROUTE } from "@/server/storage/local-signing";
import type { StorageService } from "@/server/storage/types";

/**
 * Contract shared by every StorageService implementation. `transport` performs the HTTP
 * request the browser would make with the signed URL: the local route handler in-process,
 * or a real `fetch` against a Supabase test project.
 */
interface Harness {
  service: StorageService;
  transport: (request: Request) => Promise<Response>;
  /** Makes the signed URL absolute when the provider returns a root-relative one. */
  absolute: (url: string) => string;
}

const BUCKET = "visit-photos";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

function contract(name: string, setup: () => Promise<Harness>, teardown?: () => Promise<void>) {
  describe(`StorageService contract (${name})`, () => {
    let h: Harness;
    const prefix = `contract-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const objectPath = `${prefix}/photo.jpg`;

    beforeAll(async () => {
      h = await setup();
    });
    afterAll(async () => {
      await h.service.remove(BUCKET, [objectPath, `${prefix}/second.jpg`]).catch(() => undefined);
      await teardown?.();
    });

    it("stat returns null before any upload", async () => {
      expect(await h.service.stat(BUCKET, objectPath)).toBeNull();
    });

    it("createSignedUpload then PUT stores the object, stat sees it", async () => {
      const upload = await h.service.createSignedUpload(BUCKET, objectPath, {
        contentType: "image/jpeg",
        maxBytes: 1024,
      });
      expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(upload.headers["Content-Type"]).toBe("image/jpeg");
      const response = await h.transport(
        new Request(h.absolute(upload.url), {
          method: "PUT",
          headers: upload.headers,
          body: JPEG,
        }),
      );
      expect(response.status, await response.clone().text()).toBeLessThan(300);
      expect(await h.service.stat(BUCKET, objectPath)).toEqual({
        size: JPEG.byteLength,
        contentType: "image/jpeg",
      });
    });

    it("createSignedRead then GET returns the same bytes", async () => {
      const url = await h.service.createSignedRead(BUCKET, objectPath, 60);
      const response = await h.transport(new Request(h.absolute(url)));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^image\/jpeg/);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
    });

    it("createSignedReads returns one URL per existing object only", async () => {
      const urls = await h.service.createSignedReads(
        BUCKET,
        [objectPath, `${prefix}/missing.jpg`],
        60,
      );
      expect(Object.keys(urls)).toEqual([objectPath]);
      const response = await h.transport(new Request(h.absolute(urls[objectPath]!)));
      expect(response.status).toBe(200);
    });

    it("remove deletes the object and ignores missing ones", async () => {
      await h.service.remove(BUCKET, [objectPath, `${prefix}/missing.jpg`]);
      expect(await h.service.stat(BUCKET, objectPath)).toBeNull();
      const url = await h.service.createSignedRead(BUCKET, objectPath, 60);
      const response = await h.transport(new Request(h.absolute(url)));
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("refuses an unsafe path before touching the backend", async () => {
      await expect(
        h.service.createSignedUpload(BUCKET, "../escape.jpg", {
          contentType: "image/jpeg",
          maxBytes: 10,
        }),
      ).rejects.toThrow(/Chemin/);
      await expect(h.service.createSignedRead(BUCKET, "/abs.jpg", 60)).rejects.toThrow(/Chemin/);
    });
  });
}

// --- local: always ---------------------------------------------------------------------------

const SECRET = "contract-secret-with-at-least-32-characters-00";
let dir = "";

contract(
  "local",
  async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ronde-storage-"));
    const service = new LocalStorageService({ dir, secret: SECRET });
    return {
      service,
      absolute: (url) => `http://ronde.test${url}`,
      transport: (request) => {
        const pathname = new URL(request.url).pathname;
        const segments = pathname.slice(`${LOCAL_STORAGE_ROUTE}/`.length).split("/");
        return serveLocalStorage(service, SECRET, request, segments);
      },
    };
  },
  async () => {
    await rm(dir, { recursive: true, force: true });
  },
);

// --- supabase: only against a dedicated test project ---------------------------------------

const SUPABASE_TEST_URL = process.env.SUPABASE_TEST_URL;
const SUPABASE_TEST_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

if (SUPABASE_TEST_URL && SUPABASE_TEST_SERVICE_ROLE_KEY) {
  contract("supabase", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SupabaseStorageService } = await import("@/server/storage/supabase");
    const client = createClient(SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return {
      service: new SupabaseStorageService(client as never),
      absolute: (url) => url,
      transport: (request) => fetch(request),
    };
  });
} else {
  describe.skip("StorageService contract (supabase) — ignorée : SUPABASE_TEST_URL et SUPABASE_TEST_SERVICE_ROLE_KEY absentes", () => {
    it("runs only against a dedicated Supabase test project", () => undefined);
  });
}
