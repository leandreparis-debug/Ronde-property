"use client";

import { Download, ExternalLink, FileText, RotateCcw, Settings2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { IncompletePoints } from "@/components/visits/incomplete-points";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  type GeneratedReport,
  generateReport,
  type GenerationStep,
  saveReport,
} from "@/lib/report/generate";
import {
  PHOTOS_PER_PAGE,
  REPORT_QUALITIES,
  REPORT_QUALITY_LABELS,
  REPORT_SECTION_LABELS,
  REPORT_SECTIONS,
  type ReportOptions,
  summariseReportOptions,
} from "@/lib/report/options";
import type { IncompletePoint } from "@/server/domain/visits";
import type { PhotoView } from "@/server/photos/types";
import type { ReportView } from "@/server/reports/service";

export interface ReportTabProps {
  visitId: string;
  initialReports: ReportView[];
  /** Options of the last report of the visit (or the defaults). */
  initialOptions: ReportOptions;
  /** Ready photos, offered as cover photo. */
  photos: PhotoView[];
  /** Points to complete (steps 5 to 9), recalled without blocking. */
  incomplete: IncompletePoint[];
  /**
   * Why the report cannot be generated now (offline, changes waiting for the synchronisation):
   * the button is disabled and the reason shown.
   */
  blockedReason?: string | null;
}

/** « 2,4 Mo », « 830 Ko ». */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/** Text of a progress step. */
export function stepLabel(step: GenerationStep): string {
  switch (step.kind) {
    case "preparing":
      return "Préparation des données…";
    case "images":
      return step.total === 0
        ? "Aucune image à charger"
        : `Chargement des photos ${step.done} sur ${step.total}`;
    case "layout":
      return "Mise en page…";
    case "saving":
      return "Enregistrement…";
  }
}

function stepRatio(step: GenerationStep): number {
  switch (step.kind) {
    case "preparing":
      return 0.04;
    case "images":
      return 0.05 + (step.total === 0 ? 0.5 : (0.5 * step.done) / step.total);
    case "layout":
      return 0.62;
    case "saving":
      return 0.85 + (step.total === 0 ? 0 : (0.15 * step.loaded) / step.total);
  }
}

/**
 * « Rapport » tab: options (sheet, remembered from the last report of the visit), reminder of
 * the incomplete points (never blocking), generation in the browser with its progress and
 * « Annuler » until the storage, immediate download, storage with « Réessayer
 * l'enregistrement » when it fails, preview in a new tab on a computer, and the history of the
 * reports (never modified nor deleted) with their signed download.
 */
export function ReportTab({
  visitId,
  initialReports,
  initialOptions,
  photos,
  incomplete,
  blockedReason = null,
}: ReportTabProps) {
  const id = useId();
  const router = useRouter();
  const { toast } = useToast();
  const [reports, setReports] = useState(initialReports);
  const [options, setOptions] = useState(initialOptions);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [step, setStep] = useState<GenerationStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedReport | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [wide, setWide] = useState(false);
  const [ready, setReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => setReports(initialReports), [initialReports]);
  useEffect(() => {
    setReady(true);
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 1024px)");
    setWide(query.matches);
    const listener = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", listener);
    return () => {
      query.removeEventListener("change", listener);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  const busy = step !== null;
  const cancellable = busy && step.kind !== "saving";

  function finished(saved: GeneratedReport["saved"]) {
    if (saved.ok) {
      setReports((list) => [saved.report, ...list.filter((r) => r.id !== saved.report.id)]);
      router.refresh();
    }
  }

  async function generate() {
    setError(null);
    setResult(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const generated = await generateReport({
        visitId,
        options,
        signal: abort.signal,
        onStep: setStep,
      });
      setResult(generated);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(generated.blob);
      finished(generated.saved);
      if (generated.saved.ok) {
        toast({ variant: "success", title: `${generated.fileName} téléchargé et enregistré` });
      }
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") {
        toast({ variant: "info", title: "Génération annulée" });
      } else {
        setError(failure instanceof Error ? failure.message : "La génération a échoué.");
      }
    } finally {
      controller.current = null;
      setStep(null);
    }
  }

  async function retrySave() {
    if (!result) return;
    setRetrying(true);
    const saved = await saveReport(result, (loaded, total) =>
      setStep({ kind: "saving", loaded, total }),
    );
    setStep(null);
    setRetrying(false);
    setResult({ ...result, saved });
    finished(saved);
    if (saved.ok) toast({ variant: "success", title: "Rapport enregistré" });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="report-tab" data-ready={ready || undefined}>
      <section
        className="flex flex-col gap-4 rounded-lg border border-rule bg-paper p-4 md:p-6"
        aria-labelledby={`${id}-title`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id={`${id}-title`} className="font-display text-title-sm text-ink">
              Compte rendu PDF
            </h3>
            <p className="text-ui text-ink-2" data-testid="report-options-summary">
              {summariseReportOptions(options)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setOptionsOpen(true)}
              data-testid="report-open-options"
            >
              <Settings2 className="size-4" aria-hidden="true" />
              Options
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={busy || !ready || Boolean(blockedReason)}
              onClick={() => void generate()}
              data-testid="report-generate"
            >
              <FileText className="size-5" aria-hidden="true" />
              Générer le rapport
            </Button>
          </div>
        </div>

        {blockedReason && !busy ? (
          <p
            className="rounded-md bg-craie px-3 py-2 text-ui text-ink-2"
            data-testid="report-blocked"
          >
            {blockedReason}
          </p>
        ) : null}

        {incomplete.length > 0 ? (
          <div data-testid="report-incomplete">
            <IncompletePoints points={incomplete} />
            <p className="mt-2 text-ui text-ink-2">
              Ces points n&apos;empêchent pas la génération : le rapport reprend la visite telle
              qu&apos;elle est.
            </p>
          </div>
        ) : null}

        {step ? (
          <div
            className="flex flex-col gap-2 rounded-md bg-brand-tint p-3"
            role="status"
            aria-live="polite"
            data-testid="report-progress"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ui font-semibold text-ink" data-testid="report-step">
                {stepLabel(step)}
              </p>
              {cancellable ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => controller.current?.abort()}
                  data-testid="report-cancel"
                >
                  <X className="size-4" aria-hidden="true" />
                  Annuler
                </Button>
              ) : null}
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-pill bg-paper"
              role="progressbar"
              aria-label="Progression du rapport"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(stepRatio(step) * 100)}
            >
              <div
                className="h-full rounded-pill bg-brand transition-[width]"
                style={{ width: `${Math.round(stepRatio(step) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? <ErrorNotice message={error} /> : null}

        {result && !step ? (
          <div
            className="flex flex-col gap-2"
            data-testid="report-result"
            data-mode={result.mode}
            data-size={result.blob.size}
            data-pages={result.pageCount}
            data-images-ms={Math.round(result.durations.imagesMs)}
            data-layout-ms={Math.round(result.durations.layoutMs)}
            data-total-ms={Math.round(result.durations.totalMs)}
          >
            {result.saved.ok ? (
              <p className="text-ui text-ink">
                <strong>{result.fileName}</strong> : {result.pageCount} pages,{" "}
                {formatFileSize(result.blob.size)}, téléchargé et enregistré.
              </p>
            ) : (
              <div className="flex flex-col gap-2" data-testid="report-save-failed">
                <ErrorNotice
                  message={`Le fichier ${result.fileName} est téléchargé et reste valable, mais l'enregistrement a échoué : ${result.saved.error}`}
                />
                {result.saved.retryable ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="self-start"
                    loading={retrying}
                    onClick={() => void retrySave()}
                    data-testid="report-retry-save"
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Réessayer l&apos;enregistrement
                  </Button>
                ) : null}
              </div>
            )}
            {result.missingImages > 0 ? (
              <p className="text-ui text-ink-2" data-testid="report-missing">
                {result.missingImages} image{result.missingImages > 1 ? "s" : ""} indisponible
                {result.missingImages > 1 ? "s" : ""} : remplacée
                {result.missingImages > 1 ? "s" : ""} par « Photo indisponible » dans le PDF.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {wide && previewUrl.current ? (
                <Button asChild variant="secondary">
                  <a
                    href={previewUrl.current}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="report-preview"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    Ouvrir l&apos;aperçu
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-history`} className="flex flex-col gap-3">
        <h3 id={`${id}-history`} className="label-caps text-ink-2">
          Rapports enregistrés
        </h3>
        {reports.length === 0 ? (
          <EmptyState
            mood="asleep"
            title="Aucun rapport généré pour cette visite"
            description="Le rapport est conservé ici à chaque génération, avec sa date et son auteur."
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="report-history">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-paper p-3"
                data-testid="report-history-item"
                data-draft={report.isDraft || undefined}
              >
                <FileText className="size-6 shrink-0 text-ink-2" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
                    Rapport n° {report.number}
                    {report.isDraft ? (
                      <Badge data-testid="report-draft-badge">Brouillon</Badge>
                    ) : null}
                  </p>
                  <p className="text-ui text-ink-2">
                    {formatDateTime(report.generatedAt)}
                    {report.generatedByName ? ` · ${report.generatedByName}` : ""} ·{" "}
                    {report.pageCount ?? "—"} pages · {formatFileSize(report.sizeBytes)}
                  </p>
                  <p className="truncate text-ui text-ink-2">{report.optionsSummary}</p>
                </div>
                <Button asChild variant="secondary">
                  <a
                    href={`/visites/${visitId}/rapports/${report.id}`}
                    data-testid="report-download"
                    aria-label={`Télécharger le rapport n° ${report.number}`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    Télécharger
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReportOptionsSheet
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        options={options}
        photos={photos}
        onChange={setOptions}
      />
    </div>
  );
}

/**
 * Options of the report: sections (the cover is always printed), done reserves, photos per
 * page, quality and cover photo. Applied at once; remembered with the next report.
 */
export function ReportOptionsSheet({
  open,
  onOpenChange,
  options,
  photos,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ReportOptions;
  photos: PhotoView[];
  onChange: (options: ReportOptions) => void;
}) {
  const id = useId();
  function toggleSection(section: (typeof REPORT_SECTIONS)[number], checked: boolean) {
    const sections = checked
      ? REPORT_SECTIONS.filter((s) => s === section || options.sections.includes(s))
      : options.sections.filter((s) => s !== section);
    onChange({ ...options, sections });
  }
  const segment = (active: boolean) =>
    cn(
      "min-h-11 rounded-sm px-3 text-ui font-semibold",
      "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
      active ? "bg-paper text-ink shadow-raised" : "text-ink-2 hover:text-ink",
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={cn(
          "top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0",
          "lg:right-0 lg:left-auto lg:w-[30rem] lg:rounded-l-xl",
          "motion-safe:data-[state=open]:animate-sheet-in",
        )}
        data-testid="report-options"
      >
        <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
          <DialogTitle className="font-display text-title-sm text-ink">
            Options du rapport
          </DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" aria-label="Fermer les options">
              <X className="size-5" aria-hidden="true" />
            </Button>
          </DialogClose>
        </header>
        <DialogDescription className="sr-only">
          Rubriques, réserves levées, photos par page, qualité et photo de garde.
        </DialogDescription>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-ui font-semibold text-ink">Rubriques</legend>
            <label className="flex min-h-11 items-center gap-3 text-body text-ink-2">
              <input type="checkbox" className="size-5 accent-brand" checked disabled />
              Couverture (toujours incluse)
            </label>
            {REPORT_SECTIONS.map((section) => (
              <label key={section} className="flex min-h-11 items-center gap-3 text-body text-ink">
                <input
                  type="checkbox"
                  className="size-5 accent-brand"
                  checked={options.sections.includes(section)}
                  onChange={(event) => toggleSection(section, event.target.checked)}
                  data-testid={`report-section-${section}`}
                />
                {REPORT_SECTION_LABELS[section]}
              </label>
            ))}
          </fieldset>

          <label className="flex min-h-11 items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={options.includeDoneReserves}
              onChange={(event) =>
                onChange({ ...options, includeDoneReserves: event.target.checked })
              }
              data-testid="report-include-done"
            />
            Inclure les réserves levées
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-ui font-semibold text-ink">Photos par page</legend>
            <div
              role="radiogroup"
              aria-label="Photos par page"
              className="grid grid-cols-3 gap-1 rounded-md bg-galet p-1"
            >
              {PHOTOS_PER_PAGE.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={options.photosPerPage === value}
                  className={segment(options.photosPerPage === value)}
                  onClick={() => onChange({ ...options, photosPerPage: value })}
                  data-testid={`report-per-page-${value}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-ui font-semibold text-ink">Qualité</legend>
            <div
              role="radiogroup"
              aria-label="Qualité"
              className="grid grid-cols-2 gap-1 rounded-md bg-galet p-1"
            >
              {REPORT_QUALITIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={options.quality === value}
                  className={segment(options.quality === value)}
                  onClick={() => onChange({ ...options, quality: value })}
                  data-testid={`report-quality-${value}`}
                >
                  {REPORT_QUALITY_LABELS[value]}
                </button>
              ))}
            </div>
            <p className="text-ui text-ink-2">
              « Légère » réduit les photos à 1 000 px : un fichier plus petit, pour l&apos;envoi par
              messagerie.
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-ui font-semibold text-ink">Photo de garde</legend>
            <label className="flex min-h-11 items-center gap-3 text-body text-ink">
              <input
                type="radio"
                name={`${id}-cover`}
                className="size-5 accent-brand"
                checked={options.coverPhotoId === null}
                onChange={() => onChange({ ...options, coverPhotoId: null })}
              />
              Celle de la visite
            </label>
            {photos.length > 0 ? (
              <ul
                className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                aria-label="Autre photo de garde"
              >
                {photos.map((photo) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      aria-pressed={options.coverPhotoId === photo.id}
                      aria-label={`Photo de garde : ${photo.caption ?? "Sans légende"}`}
                      onClick={() => onChange({ ...options, coverPhotoId: photo.id })}
                      className={cn(
                        "block aspect-[4/3] w-full overflow-hidden rounded-md border-2 bg-galet",
                        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        options.coverPhotoId === photo.id ? "border-brand" : "border-transparent",
                      )}
                    >
                      {photo.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img
                          src={photo.thumbUrl}
                          alt=""
                          loading="lazy"
                          width={120}
                          height={90}
                          className="size-full object-cover"
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>
        </div>
        <footer className="border-t border-rule px-4 py-3">
          <DialogClose asChild>
            <Button type="button" size="lg" className="w-full" data-testid="report-options-done">
              Valider
            </Button>
          </DialogClose>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
