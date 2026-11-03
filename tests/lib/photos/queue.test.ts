import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessedPhoto } from "@/lib/photos/process";
import {
  type ConfirmOutcome,
  createUploadQueue,
  type PreparedUpload,
  type PutResult,
  type UploadItem,
  type UploadQueue,
  type UploadQueueDeps,
  type UploadTarget,
  uploadStatusLabel,
} from "@/lib/photos/queue";

function blob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

function processed(size = 1000): ProcessedPhoto {
  return {
    main: blob(size),
    thumb: blob(Math.round(size / 4)),
    width: 1600,
    height: 1200,
    takenAt: "2026-05-04T10:00:00.000Z",
    originalFilename: "IMG_0001.jpg",
  };
}

function target(url: string): UploadTarget {
  return { url, headers: { "Content-Type": "image/jpeg" }, expiresAt: "2026-05-04T10:02:00Z" };
}

let photoCounter = 0;
function prepared(): PreparedUpload {
  photoCounter += 1;
  const id = `photo-${photoCounter}`;
  return { photoId: id, main: target(`/put/${id}.jpg`), thumb: target(`/put/${id}_thumb.jpg`) };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every pending microtask run. */
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function makeDeps(overrides: Partial<UploadQueueDeps> = {}) {
  const calls = { prepare: 0, put: [] as string[], confirm: [] as string[], renew: [] as string[] };
  const deps: UploadQueueDeps = {
    process: vi.fn(async () => processed()),
    prepare: vi.fn(async () => {
      calls.prepare += 1;
      return [prepared()];
    }),
    renew: vi.fn(async (photoId: string) => {
      calls.renew.push(photoId);
      const next = prepared();
      return { ...next, photoId };
    }),
    put: vi.fn(async (t: UploadTarget, body: Blob, onProgress): Promise<PutResult> => {
      calls.put.push(t.url);
      onProgress(body.size / 2, body.size);
      onProgress(body.size, body.size);
      return { status: 200 };
    }),
    confirm: vi.fn(async (photoId: string): Promise<ConfirmOutcome> => {
      calls.confirm.push(photoId);
      return { ok: true };
    }),
    discard: vi.fn(async () => undefined),
    onUploaded: vi.fn(),
    createObjectUrl: () => "blob:thumb",
    revokeObjectUrl: vi.fn(),
    ...overrides,
  };
  return { deps, calls };
}

let queue: UploadQueue;
const history: UploadItem[][] = [];

beforeEach(() => {
  vi.useFakeTimers();
  history.length = 0;
  photoCounter = 0;
});
afterEach(() => {
  queue?.dispose();
  vi.useRealTimers();
});

function statusesOf(localId: string): string[] {
  const seen: string[] = [];
  for (const items of history) {
    const item = items.find((i) => i.localId === localId);
    if (item && seen.at(-1) !== item.status) seen.push(item.status);
  }
  return seen;
}

describe("createUploadQueue", () => {
  it("runs a file through every stage and reports progress", async () => {
    const { deps, calls } = makeDeps();
    queue = createUploadQueue(deps);
    queue.onChange((items) => history.push(items));
    queue.enqueue([{ file: blob(10), name: "IMG_0001.jpg" }], { zoneKey: "docks" });
    await flush(40);

    const [item] = queue.items();
    expect(item?.status).toBe("done");
    expect(item?.progress).toBe(100);
    expect(item?.photoId).toBe("photo-1");
    expect(item?.previewUrl).toBe("blob:thumb");
    expect(statusesOf(item!.localId)).toEqual([
      "queued",
      "processing",
      "preparing",
      "uploading",
      "confirming",
      "done",
    ]);
    expect(deps.prepare).toHaveBeenCalledWith([
      {
        originalFilename: "IMG_0001.jpg",
        width: 1600,
        height: 1200,
        sizeBytes: 1000,
        thumbSizeBytes: 250,
        takenAt: "2026-05-04T10:00:00.000Z",
        zoneKey: "docks",
      },
    ]);
    expect(calls.put).toEqual(["/put/photo-1.jpg", "/put/photo-1_thumb.jpg"]);
    expect(calls.confirm).toEqual(["photo-1"]);
    expect(deps.onUploaded).toHaveBeenCalledWith("photo-1");
    expect(queue.hasActive()).toBe(false);
    // Progress went through intermediate values.
    const progresses = history
      .map((items) => items[0]?.progress ?? 0)
      .filter((p) => p > 0 && p < 100);
    expect(progresses.length).toBeGreaterThan(0);
  });

  it("rejects an unsupported file with its message and continues with the others", async () => {
    const { deps } = makeDeps({
      process: vi.fn(async (_file: Blob, name: string | null) => {
        if (name === "faux.jpg")
          throw new Error("Format non pris en charge : utilisez JPEG, PNG ou WebP.");
        return processed();
      }),
    });
    queue = createUploadQueue(deps);
    queue.enqueue([
      { file: blob(10), name: "faux.jpg" },
      { file: blob(10), name: "ok.jpg" },
    ]);
    await flush(40);
    const [bad, good] = queue.items();
    expect(bad?.status).toBe("rejected");
    expect(bad?.error).toBe("Format non pris en charge : utilisez JPEG, PNG ou WebP.");
    expect(uploadStatusLabel(bad!)).toBe("Format non pris en charge : utilisez JPEG, PNG ou WebP.");
    expect(good?.status).toBe("done");
    expect(queue.hasActive()).toBe(false);
  });

  it("processes two files at a time and uploads three at a time", async () => {
    const processing: Array<Deferred<ProcessedPhoto>> = [];
    const puts: Array<Deferred<PutResult>> = [];
    const { deps } = makeDeps({
      process: vi.fn(() => {
        const d = deferred<ProcessedPhoto>();
        processing.push(d);
        return d.promise;
      }),
      put: vi.fn(() => {
        const d = deferred<PutResult>();
        puts.push(d);
        return d.promise;
      }),
    });
    queue = createUploadQueue(deps);
    queue.enqueue(Array.from({ length: 6 }, (_, i) => ({ file: blob(10), name: `${i}.jpg` })));
    await flush();
    expect(queue.items().filter((i) => i.status === "processing")).toHaveLength(2);
    expect(queue.items().filter((i) => i.status === "queued")).toHaveLength(4);

    for (const d of processing.splice(0)) d.resolve(processed());
    await flush(20);
    // Two more are processing, two are preparing/uploading.
    expect(queue.items().filter((i) => i.status === "processing")).toHaveLength(2);
    for (const d of processing.splice(0)) d.resolve(processed());
    await flush(20);
    for (const d of processing.splice(0)) d.resolve(processed());
    await flush(20);

    const uploading = queue.items().filter((i) => i.status === "uploading");
    expect(uploading).toHaveLength(3);
    expect(queue.items().filter((i) => i.status === "preparing")).toHaveLength(3);
    expect(puts).toHaveLength(3);

    // Finishing one item (two PUTs) frees a slot.
    puts[0]!.resolve({ status: 200 });
    await flush(20);
    expect(puts).toHaveLength(4);
    puts[3]!.resolve({ status: 200 });
    await flush(20);
    expect(queue.items().filter((i) => i.status === "done")).toHaveLength(1);
    expect(queue.items().filter((i) => i.status === "uploading")).toHaveLength(3);
  });

  it("retries a network failure after 1 s, 3 s and 10 s, then fails, and « Réessayer » restarts", async () => {
    let failures = 0;
    const { deps, calls } = makeDeps({
      put: vi.fn(async (t: UploadTarget): Promise<PutResult> => {
        calls.put.push(t.url);
        if (failures < 4) {
          failures += 1;
          throw new Error("network");
        }
        return { status: 200 };
      }),
    });
    queue = createUploadQueue(deps);
    queue.enqueue([{ file: blob(10), name: "a.jpg" }]);
    await flush(30);
    expect(queue.items()[0]?.status).toBe("preparing");
    expect(uploadStatusLabel(queue.items()[0]!)).toBe("Hors connexion : nouvelle tentative…");
    expect(calls.put).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(calls.put).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush(30);
    expect(calls.put).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3_000);
    await flush(30);
    expect(calls.put).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(10_000);
    await flush(30);
    expect(calls.put).toHaveLength(4);
    expect(queue.items()[0]?.status).toBe("failed");
    expect(uploadStatusLabel(queue.items()[0]!)).toMatch(/^Échec : /);
    expect(queue.hasActive()).toBe(false);
    // The pending row was created once: no second prepare on retry.
    expect(calls.prepare).toBe(1);

    queue.retry(queue.items()[0]!.localId);
    await flush(40);
    expect(queue.items()[0]?.status).toBe("done");
    expect(calls.prepare).toBe(1);
    expect(calls.confirm).toEqual(["photo-1"]);
  });

  it("asks for new URLs when the storage answers 410 and retries the same object", async () => {
    let first = true;
    const { deps, calls } = makeDeps({
      put: vi.fn(async (t: UploadTarget): Promise<PutResult> => {
        calls.put.push(t.url);
        if (first) {
          first = false;
          return { status: 410 };
        }
        return { status: 200 };
      }),
    });
    queue = createUploadQueue(deps);
    queue.enqueue([{ file: blob(10), name: "a.jpg" }]);
    await flush(40);
    expect(queue.items()[0]?.status).toBe("done");
    expect(calls.renew).toEqual(["photo-1"]);
    expect(calls.put).toEqual(["/put/photo-1.jpg", "/put/photo-2.jpg", "/put/photo-2_thumb.jpg"]);
    expect(calls.confirm).toEqual(["photo-1"]);
  });

  it("fails without retry when the confirmation is refused for good", async () => {
    const { deps } = makeDeps({
      confirm: vi.fn(async () => ({
        ok: false,
        error: "La visite est terminée : la photo n'a pas été ajoutée.",
        retryable: false,
      })),
    });
    queue = createUploadQueue(deps);
    queue.enqueue([{ file: blob(10), name: "a.jpg" }]);
    await flush(40);
    expect(queue.items()[0]?.status).toBe("failed");
    expect(queue.items()[0]?.error).toBe("La visite est terminée : la photo n'a pas été ajoutée.");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(deps.confirm).toHaveBeenCalledTimes(1);
  });

  it("fails when the server refuses the preparation (cap, rights)", async () => {
    const { deps } = makeDeps({
      prepare: vi.fn(async () => ({ error: "Plafond de 500 photos atteint." })),
    });
    queue = createUploadQueue(deps);
    queue.enqueue([{ file: blob(10), name: "a.jpg" }]);
    await flush(40);
    expect(queue.items()[0]?.status).toBe("failed");
    expect(queue.items()[0]?.error).toBe("Plafond de 500 photos atteint.");
    expect(deps.put).not.toHaveBeenCalled();
  });

  it("removes an item in flight: the upload is aborted and the pending row discarded", async () => {
    const put = deferred<PutResult>();
    let signal: AbortSignal | undefined;
    const { deps } = makeDeps({
      put: vi.fn((_t: UploadTarget, _b: Blob, _p: unknown, s: AbortSignal) => {
        signal = s;
        return put.promise;
      }),
    });
    queue = createUploadQueue(deps);
    queue.enqueue([{ file: blob(10), name: "a.jpg" }]);
    await flush(30);
    expect(queue.items()[0]?.status).toBe("uploading");
    queue.remove(queue.items()[0]!.localId);
    expect(signal?.aborted).toBe(true);
    expect(queue.items()).toHaveLength(0);
    expect(deps.discard).toHaveBeenCalledWith("photo-1");
    expect(deps.revokeObjectUrl).toHaveBeenCalledWith("blob:thumb");
    put.reject(new Error("aborted"));
    await flush(20);
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it("clears the done items only", async () => {
    const { deps } = makeDeps({
      process: vi.fn(async (_f: Blob, name: string | null) => {
        if (name === "bad.jpg") throw new Error("refusé");
        return processed();
      }),
    });
    queue = createUploadQueue(deps);
    queue.enqueue([
      { file: blob(10), name: "ok.jpg" },
      { file: blob(10), name: "bad.jpg" },
    ]);
    await flush(40);
    queue.clearDone();
    expect(queue.items().map((i) => i.status)).toEqual(["rejected"]);
  });
});

describe("uploadStatusLabel", () => {
  const base: UploadItem = {
    localId: "u",
    name: "a.jpg",
    zoneKey: null,
    status: "queued",
    progress: 0,
    previewUrl: null,
    error: null,
    photoId: null,
    attempts: 0,
  };
  it("gives the French wording of each state", () => {
    expect(uploadStatusLabel(base)).toBe("Préparation");
    expect(uploadStatusLabel({ ...base, status: "uploading", progress: 45 })).toBe("Envoi 45 %");
    expect(uploadStatusLabel({ ...base, status: "confirming" })).toBe("Vérification");
    expect(uploadStatusLabel({ ...base, status: "done" })).toBe("Terminé");
    expect(uploadStatusLabel({ ...base, status: "failed", error: "réseau" })).toBe(
      "Échec : réseau",
    );
  });
});
