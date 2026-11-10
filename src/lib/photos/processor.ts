import { PhotoProcessingError, type ProcessedPhoto, processImageFile } from "./process";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

/** Processes files one at a time per slot; at most `concurrency` files at once. */
export interface PhotoProcessor {
  process(file: Blob, filename?: string | null): Promise<ProcessedPhoto>;
  dispose(): void;
}

/** Limits a set of asynchronous jobs to `limit` at a time (FIFO). */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await job();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

function workerSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

/**
 * Creates the processor used by the upload queue: a Web Worker with OffscreenCanvas when the
 * browser supports it (the interface never freezes), the main thread otherwise. At most two
 * images are processed at the same time, to spare the tablet's memory.
 */
export function createPhotoProcessor(options: { concurrency?: number } = {}): PhotoProcessor {
  const limit = createLimiter(options.concurrency ?? 2);
  let worker: Worker | null = null;
  // Set once the worker could not run (its script unreachable offline, a crash): the next
  // photos are processed on the main thread, which is slower but always available.
  let workerFailed = false;
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: ProcessedPhoto) => void;
      reject: (error: Error) => void;
      file: Blob;
      filename: string | null;
    }
  >();

  function getWorker(): Worker | null {
    if (worker) return worker;
    if (workerFailed || !workerSupported()) return null;
    try {
      worker = new Worker(new URL("./process.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return null;
    }
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      if (event.data.ok) entry.resolve(event.data.result);
      else entry.reject(new PhotoProcessingError(event.data.message));
    });
    worker.addEventListener("error", () => {
      // The worker could not load (offline, its script not cached yet) or crashed: the jobs in
      // flight are processed on the main thread, and so are the next ones.
      workerFailed = true;
      const jobs = [...pending.values()];
      pending.clear();
      worker?.terminate();
      worker = null;
      for (const job of jobs) {
        processImageFile(job.file, job.filename ?? undefined).then(job.resolve, job.reject);
      }
    });
    return worker;
  }

  return {
    process(file, filename) {
      return limit(() => {
        const target = getWorker();
        if (!target) return processImageFile(file, filename);
        return new Promise<ProcessedPhoto>((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject, file, filename: filename ?? null });
          const request: WorkerRequest = { id, file, filename: filename ?? null };
          target.postMessage(request);
        });
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      pending.clear();
    },
  };
}
