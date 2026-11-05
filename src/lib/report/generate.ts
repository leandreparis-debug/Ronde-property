import { putWithProgress } from "@/lib/upload/put";
import {
  confirmReportAction,
  renewReportImagesAction,
  reportUploadTargetAction,
  startReportAction,
} from "@/server/actions/report-actions";
import type { ReportView } from "@/server/reports/service";

import { loadReportImages } from "./images";
import { buildReportModel } from "./model";
import type { ReportOptions } from "./options";
import { countPdfPages, renderReport } from "./render";
import type { ReportImage } from "./types";

/** Size limit of the `reports` bucket (stored reports). */
export const STORED_REPORT_MAX_BYTES = 50 * 1024 * 1024;

/** Progress of a generation, shown step by step. */
export type GenerationStep =
  | { kind: "preparing" }
  | { kind: "images"; done: number; total: number }
  | { kind: "layout" }
  | { kind: "saving"; loaded: number; total: number };

/** Outcome of the storage of a generated report. */
export type SaveOutcome =
  { ok: true; report: ReportView } | { ok: false; error: string; retryable: boolean };

/** A generated report: the file (already downloaded), its measures and its storage. */
export interface GeneratedReport {
  reportId: string;
  visitId: string;
  fileName: string;
  blob: Blob;
  pageCount: number;
  missingImages: number;
  durations: { imagesMs: number; layoutMs: number; totalMs: number };
  mode: "worker" | "main";
  saved: SaveOutcome;
}

/** Saves a blob under a file name (immediate download in the browser). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Stores a generated PDF: signed upload URL (pending row of the user), direct `PUT` (the file
 * never goes through the server), confirmation by `stat`. Above 50 MB the file stays only on
 * the device. Never throws: the outcome says whether a retry makes sense.
 */
export async function saveReport(
  report: { reportId: string; visitId: string; blob: Blob; pageCount: number },
  onProgress: (loaded: number, total: number) => void = () => {},
): Promise<SaveOutcome> {
  const size = report.blob.size;
  if (size > STORED_REPORT_MAX_BYTES) {
    return {
      ok: false,
      retryable: false,
      error:
        "Ce rapport dépasse 50 Mo : il reste téléchargé sur votre appareil mais ne peut pas être enregistré. Régénérez-le en qualité « Légère ».",
    };
  }
  try {
    const target = await reportUploadTargetAction({ reportId: report.reportId, sizeBytes: size });
    if (!target.ok) return { ok: false, error: target.error, retryable: true };
    const put = await putWithProgress(
      target.target,
      report.blob,
      onProgress,
      new AbortController().signal,
    );
    if (put.status < 200 || put.status >= 300) {
      return { ok: false, error: "L'envoi du rapport a échoué.", retryable: true };
    }
    const confirmed = await confirmReportAction({
      reportId: report.reportId,
      visitId: report.visitId,
      sizeBytes: size,
      pageCount: report.pageCount,
    });
    return confirmed.ok
      ? { ok: true, report: confirmed.report }
      : { ok: false, error: confirmed.error, retryable: confirmed.retryable };
  } catch {
    return { ok: false, error: "Connexion perdue pendant l'enregistrement.", retryable: true };
  }
}

/**
 * Generates a report in the browser:
 *
 * 1. reserves the report and reads its frozen data (`startReportAction`);
 * 2. builds the model (pure) and loads the images, 4 at a time (« Chargement des photos »);
 * 3. lays the PDF out in a Web Worker (« Mise en page »);
 * 4. downloads the file at once, then stores it (« Enregistrement »).
 *
 * The signal cancels everything up to the storage; a cancelled generation leaves a pending
 * row that the purge removes after 24 hours. If the storage fails, the downloaded file stays
 * valid and `saved` says so.
 */
export async function generateReport({
  visitId,
  options,
  signal,
  onStep,
  download = downloadBlob,
  now = () => new Date(),
}: {
  visitId: string;
  options: ReportOptions;
  signal: AbortSignal;
  onStep: (step: GenerationStep) => void;
  download?: (blob: Blob, fileName: string) => void;
  now?: () => Date;
}): Promise<GeneratedReport> {
  const started = performance.now();
  onStep({ kind: "preparing" });
  const start = await startReportAction({ visitId, options });
  if (!start.ok) throw new Error(start.error);
  if (signal.aborted) throw new DOMException("Génération annulée.", "AbortError");

  const model = buildReportModel(start.data, options, now());
  const sources: ReportImage[] = [
    ...(model.cover.photo ? [model.cover.photo] : []),
    ...model.figures.map((figure) => figure.image),
    ...model.plans.map((plan) => plan.image),
  ];
  const imagesStarted = performance.now();
  const { images, missing } = await loadReportImages(sources, {
    quality: options.quality,
    signal,
    onProgress: (done, total) => onStep({ kind: "images", done, total }),
    renew: async (keys) => {
      const result = await renewReportImagesAction({ visitId, keys });
      return result.ok ? result.urls : {};
    },
  });
  const imagesMs = performance.now() - imagesStarted;

  onStep({ kind: "layout" });
  const rendered = await renderReport(model, images, signal);
  if (signal.aborted) throw new DOMException("Génération annulée.", "AbortError");
  const pageCount = await countPdfPages(rendered.blob);

  // The file is the user's at once; the storage comes after and cannot be cancelled.
  download(rendered.blob, start.fileName);
  onStep({ kind: "saving", loaded: 0, total: rendered.blob.size });
  const saved = await saveReport(
    { reportId: start.reportId, visitId, blob: rendered.blob, pageCount },
    (loaded, total) => onStep({ kind: "saving", loaded, total }),
  );
  return {
    reportId: start.reportId,
    visitId,
    fileName: start.fileName,
    blob: rendered.blob,
    pageCount,
    missingImages: missing.length,
    durations: {
      imagesMs,
      layoutMs: rendered.durationMs,
      totalMs: performance.now() - started,
    },
    mode: rendered.mode,
    saved,
  };
}
