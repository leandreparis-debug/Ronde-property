/// <reference lib="webworker" />
import { PhotoProcessingError, processImageFile } from "./process";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

/**
 * Web Worker entry: processes one file per message off the main thread, with OffscreenCanvas.
 * Loaded by `createPhotoProcessor` through `new Worker(new URL(..., import.meta.url))`.
 */
self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { id, file, filename } = event.data;
  let response: WorkerResponse;
  try {
    const result = await processImageFile(file, filename);
    response = { id, ok: true, result };
  } catch (error) {
    response = {
      id,
      ok: false,
      message:
        error instanceof PhotoProcessingError ? error.message : "Impossible de préparer l'image.",
    };
  }
  self.postMessage(response);
});
