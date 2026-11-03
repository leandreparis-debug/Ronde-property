import type { ProcessedPhoto } from "./process";

/** Message sent to the processing worker. */
export interface WorkerRequest {
  id: number;
  file: Blob;
  filename: string | null;
}

/** Message sent back by the processing worker. */
export type WorkerResponse =
  { id: number; ok: true; result: ProcessedPhoto } | { id: number; ok: false; message: string };
