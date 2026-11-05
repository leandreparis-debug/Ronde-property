import type { ReportModel } from "./model";
import type { ReportImages } from "./pdf/document";
import type { RenderRequest, RenderResponse } from "./pdf/report.worker";

/** Where the report fonts are served (local files, never a CDN). */
export const REPORT_FONT_PATH = "/fonts/report/";

/** Rendered PDF with the time spent and where it was laid out. */
export interface RenderedReport {
  blob: Blob;
  durationMs: number;
  mode: "worker" | "main";
}

function abortError() {
  return new DOMException("Génération annulée.", "AbortError");
}

/** Lays the PDF out in a Web Worker (the interface stays responsive). */
export function renderInWorker(
  model: ReportModel,
  images: ReportImages,
  signal: AbortSignal,
): Promise<RenderedReport> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const worker = new Worker(new URL("./pdf/report.worker.tsx", import.meta.url), {
      type: "module",
      name: "ronde-report",
    });
    const stop = () => {
      worker.terminate();
      reject(abortError());
    };
    signal.addEventListener("abort", stop, { once: true });
    worker.onmessage = (event: MessageEvent<RenderResponse>) => {
      signal.removeEventListener("abort", stop);
      worker.terminate();
      if (event.data.ok) {
        resolve({
          blob: new Blob([event.data.buffer], { type: "application/pdf" }),
          durationMs: event.data.durationMs,
          mode: "worker",
        });
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      signal.removeEventListener("abort", stop);
      worker.terminate();
      reject(new Error(event.message || "Le module de mise en page n'a pas démarré."));
    };
    const request: RenderRequest = {
      model,
      images,
      fontBase: `${window.location.origin}${REPORT_FONT_PATH}`,
    };
    worker.postMessage(request);
  });
}

/** Fallback: lays the PDF out on the main thread (browsers without module workers). */
export async function renderOnMainThread(
  model: ReportModel,
  images: ReportImages,
): Promise<RenderedReport> {
  const [{ pdf }, { ReportDocument }, { registerReportFonts }, { createElement }] =
    await Promise.all([
      import("@react-pdf/renderer"),
      import("./pdf/document"),
      import("./pdf/fonts"),
      import("react"),
    ]);
  registerReportFonts((file) => `${window.location.origin}${REPORT_FONT_PATH}${file}`);
  const started = performance.now();
  const element = createElement(ReportDocument, { model, images }) as unknown as Parameters<
    typeof pdf
  >[0];
  const blob = await pdf(element).toBlob();
  return { blob, durationMs: performance.now() - started, mode: "main" };
}

/** Worker first; the main thread only when the worker cannot run. */
export async function renderReport(
  model: ReportModel,
  images: ReportImages,
  signal: AbortSignal,
): Promise<RenderedReport> {
  try {
    return await renderInWorker(model, images, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (signal.aborted) throw abortError();
    return renderOnMainThread(model, images);
  }
}

/** Number of pages of a PDF produced by the report (page objects of the file). */
export async function countPdfPages(blob: Blob): Promise<number> {
  const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}
