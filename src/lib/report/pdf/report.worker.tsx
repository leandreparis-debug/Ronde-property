/// <reference lib="webworker" />
import { pdf } from "@react-pdf/renderer";

import type { ReportModel } from "../model";
import { ReportDocument, type ReportImages } from "./document";
import { registerReportFonts } from "./fonts";

/** Message sent to the worker: the model, the loaded images and the font base URL. */
export interface RenderRequest {
  model: ReportModel;
  images: ReportImages;
  fontBase: string;
}

/** Answer of the worker: the PDF bytes and the layout time, or an error. */
export type RenderResponse =
  { ok: true; buffer: ArrayBuffer; durationMs: number } | { ok: false; error: string };

declare const self: DedicatedWorkerGlobalScope;

// Layout and PDF encoding run here, off the main thread: the interface stays responsive.
self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  try {
    const { model, images, fontBase } = event.data;
    registerReportFonts((file) => `${fontBase}${file}`);
    const started = performance.now();
    const blob = await pdf(<ReportDocument model={model} images={images} />).toBlob();
    const buffer = await blob.arrayBuffer();
    const message: RenderResponse = { ok: true, buffer, durationMs: performance.now() - started };
    self.postMessage(message, [buffer]);
  } catch (error) {
    const message: RenderResponse = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
};
