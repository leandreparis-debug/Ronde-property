import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessedPhoto } from "@/lib/photos/process";

const processImageFile = vi.fn(
  async (_file: Blob, filename?: string | null): Promise<ProcessedPhoto> =>
    ({ originalFilename: filename ?? null }) as unknown as ProcessedPhoto,
);

vi.mock("@/lib/photos/process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/photos/process")>()),
  processImageFile: (file: Blob, filename?: string | null) => processImageFile(file, filename),
}));

/** A worker whose script cannot load (offline, not cached yet): it only emits `error`. */
class UnreachableWorker extends EventTarget {
  static created = 0;
  constructor() {
    super();
    UnreachableWorker.created += 1;
    setTimeout(() => this.dispatchEvent(new Event("error")), 0);
  }
  postMessage() {}
  terminate() {}
}

describe("createPhotoProcessor", () => {
  beforeEach(() => {
    UnreachableWorker.created = 0;
    processImageFile.mockClear();
    vi.stubGlobal("Worker", UnreachableWorker);
    vi.stubGlobal("OffscreenCanvas", class {});
    vi.stubGlobal("createImageBitmap", () => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("processes on the main thread when the worker cannot load, then stops trying it", async () => {
    const { createPhotoProcessor } = await import("@/lib/photos/processor");
    const processor = createPhotoProcessor();
    const file = new Blob(["x"], { type: "image/jpeg" });

    const first = await processor.process(file, "hors-reseau.jpg");
    expect(first).toMatchObject({ originalFilename: "hors-reseau.jpg" });
    expect(processImageFile).toHaveBeenCalledTimes(1);

    const second = await processor.process(file, "suivante.jpg");
    expect(second).toMatchObject({ originalFilename: "suivante.jpg" });
    expect(processImageFile).toHaveBeenCalledTimes(2);
    expect(UnreachableWorker.created).toBe(1);
    processor.dispose();
  });
});
