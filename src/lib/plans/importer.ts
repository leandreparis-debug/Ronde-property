import {
  MAX_PLAN_BYTES,
  PLAN_TOO_LARGE_MESSAGE,
  UNSUPPORTED_PLAN_MESSAGE,
} from "@/server/domain/plans";
import type {
  PlanMimeType,
  PlanView,
  PreparedPageUpload,
  PreparedPlanUpload,
  PreparePageInput,
  UploadTargetView,
} from "@/server/plans/types";

import { PLAN_MAGIC_LENGTH, sniffPlanType } from "./magic";
import { PlanConversionError, type PlanSource, type RenderedPage } from "./render";

/** Progress of an import, for the dialog. */
export type ImportProgress =
  | { stage: "original"; percent: number }
  | { stage: "page"; page: number; pageCount: number; step: "convert" | "upload"; percent: number }
  | { stage: "confirm" }
  | { stage: "retry"; message: string };

/** Server calls and transport, injected so that the orchestration is unit-testable. */
export interface PlanImportDeps {
  prepare: (input: {
    name: string;
    mimeType: PlanMimeType;
    sizeBytes: number;
    pageCount: number;
  }) => Promise<PreparedPlanUpload | { error: string }>;
  preparePages: (
    planId: string,
    pages: PreparePageInput[],
  ) => Promise<PreparedPageUpload[] | { error: string }>;
  renew: (
    planId: string,
  ) => Promise<{ original: PreparedPlanUpload; pages: PreparedPageUpload[] } | { error: string }>;
  confirm: (
    planId: string,
  ) => Promise<{ ok: true; plan: PlanView } | { ok: false; error: string; retryable: boolean }>;
  discard: (planId: string) => Promise<void>;
  put: (
    target: UploadTargetView,
    body: Blob,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
  ) => Promise<{ status: number }>;
  /** Milliseconds before each retry of a `PUT` (default 1 s, 3 s, 10 s). */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

/** The import was cancelled by the user. */
export class ImportCancelledError extends Error {
  constructor() {
    super("Import annulé.");
    this.name = "ImportCancelledError";
  }
}

/** Checks the file before anything else: size, then format by magic bytes. */
export async function detectPlanType(file: Blob): Promise<PlanMimeType> {
  if (file.size > MAX_PLAN_BYTES) throw new PlanConversionError(PLAN_TOO_LARGE_MESSAGE);
  const head = new Uint8Array(await file.slice(0, PLAN_MAGIC_LENGTH).arrayBuffer());
  const type = sniffPlanType(head);
  if (!type) throw new PlanConversionError(UNSUPPORTED_PLAN_MESSAGE);
  return type;
}

const DEFAULT_DELAYS = [1_000, 3_000, 10_000];

function urlRefused(status: number) {
  return status === 400 || status === 401 || status === 403 || status === 410;
}

/**
 * Imports a plan: pending row and original upload, then each page converted, prepared and
 * uploaded one at a time (a single page in memory), then the confirmation. Network failures
 * and 5xx are retried after 1 s, 3 s and 10 s; an expired URL is renewed once per attempt.
 * On cancellation (signal) before the confirmation, the pending plan is discarded.
 */
export async function importPlan(
  args: {
    file: Blob;
    name: string;
    mimeType: PlanMimeType;
    source: PlanSource;
    signal: AbortSignal;
    onProgress: (progress: ImportProgress) => void;
  },
  deps: PlanImportDeps,
): Promise<PlanView> {
  const delays = deps.retryDelaysMs ?? DEFAULT_DELAYS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { file, source, signal, onProgress } = args;

  function check() {
    if (signal.aborted) throw new ImportCancelledError();
  }

  const prepared = await deps.prepare({
    name: args.name,
    mimeType: args.mimeType,
    sizeBytes: file.size,
    pageCount: source.pageCount,
  });
  if ("error" in prepared) throw new PlanConversionError(prepared.error);
  const planId = prepared.planId;

  /** Uploads one object with retries; `pick` finds its target again after a renewal. */
  async function upload(
    initial: UploadTargetView,
    body: Blob,
    pick: (renewed: {
      original: PreparedPlanUpload;
      pages: PreparedPageUpload[];
    }) => UploadTargetView | undefined,
    progress: (percent: number) => void,
  ): Promise<void> {
    let target = initial;
    for (let attempt = 0; ; attempt += 1) {
      check();
      let status: number | null = null;
      try {
        ({ status } = await deps.put(
          target,
          body,
          (loaded, total) => progress(total > 0 ? Math.round((loaded / total) * 100) : 0),
          signal,
        ));
      } catch {
        check();
      }
      if (status !== null && status >= 200 && status < 300) return;
      if (status !== null && urlRefused(status)) {
        const renewed = await deps.renew(planId);
        if ("error" in renewed) throw new PlanConversionError(renewed.error);
        const next = pick(renewed);
        if (!next) throw new PlanConversionError("Envoi impossible : adresse introuvable.");
        target = next;
      } else if (status !== null && status < 500 && status !== 429) {
        throw new PlanConversionError(`Le stockage a refusé le fichier (code ${status}).`);
      }
      const delay = delays[attempt];
      if (delay === undefined) {
        throw new PlanConversionError("Échec de l'envoi après plusieurs tentatives.");
      }
      onProgress({ stage: "retry", message: "Hors connexion : nouvelle tentative…" });
      await sleep(delay);
    }
  }

  try {
    await upload(
      prepared.original,
      file,
      (renewed) => renewed.original.original,
      (percent) => onProgress({ stage: "original", percent }),
    );

    for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber += 1) {
      check();
      onProgress({
        stage: "page",
        page: pageNumber,
        pageCount: source.pageCount,
        step: "convert",
        percent: 0,
      });
      let page: RenderedPage | null = await source.renderPage(pageNumber);
      check();
      const targets = await deps.preparePages(planId, [
        {
          pageNumber,
          imageMime: page.imageMime,
          width: page.width,
          height: page.height,
          sizeBytes: page.image.size,
          thumbSizeBytes: page.thumb.size,
        },
      ]);
      if ("error" in targets) throw new PlanConversionError(targets.error);
      const target = targets.find((t) => t.pageNumber === pageNumber);
      if (!target) throw new PlanConversionError("Réponse du serveur incomplète.");
      const total = page.image.size + page.thumb.size;
      const share = total > 0 ? page.image.size / total : 0.9;
      const report = (offset: number, weight: number) => (percent: number) =>
        onProgress({
          stage: "page",
          page: pageNumber,
          pageCount: source.pageCount,
          step: "upload",
          percent: Math.round(offset * 100 + percent * weight),
        });
      await upload(
        target.image,
        page.image,
        (renewed) => renewed.pages.find((p) => p.pageNumber === pageNumber)?.image,
        report(0, share),
      );
      await upload(
        target.thumb,
        page.thumb,
        (renewed) => renewed.pages.find((p) => p.pageNumber === pageNumber)?.thumb,
        report(share, 1 - share),
      );
      // Only one page in memory at a time.
      page = null;
    }

    check();
    onProgress({ stage: "confirm" });
    const confirmed = await deps.confirm(planId);
    if (!confirmed.ok) throw new PlanConversionError(confirmed.error);
    return confirmed.plan;
  } catch (error) {
    await deps.discard(planId).catch(() => undefined);
    throw error;
  } finally {
    source.destroy();
  }
}

/** French label of a progress step. */
export function importProgressLabel(progress: ImportProgress | null): string {
  if (!progress) return "Préparation…";
  switch (progress.stage) {
    case "original":
      return `Envoi du fichier d'origine : ${progress.percent} %`;
    case "page":
      return progress.step === "convert"
        ? `Conversion de la page ${progress.page} sur ${progress.pageCount}`
        : `Envoi de la page ${progress.page} sur ${progress.pageCount} : ${progress.percent} %`;
    case "confirm":
      return "Vérification…";
    case "retry":
      return progress.message;
  }
}
