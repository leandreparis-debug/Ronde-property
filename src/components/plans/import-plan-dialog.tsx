"use client";

import { FileUp, X } from "lucide-react";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import {
  detectPlanType,
  ImportCancelledError,
  type ImportProgress,
  importPlan,
  importProgressLabel,
} from "@/lib/plans/importer";
import {
  openImageSource,
  openPdfSource,
  PlanConversionError,
  type PlanSource,
} from "@/lib/plans/render";
import { putWithProgress } from "@/lib/upload/put";
import {
  confirmPlanUploadAction,
  discardPlanUploadAction,
  preparePageUploadsAction,
  preparePlanUploadAction,
  renewPlanUploadsAction,
} from "@/server/actions/plan-actions";
import { pagesLabel, PLAN_NAME_MAX_LENGTH, planNameFromFilename } from "@/server/domain/plans";
import type { PlanMimeType, PlanView } from "@/server/plans/types";

export interface ImportPlanDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (plan: PlanView) => void;
}

interface Analysed {
  file: File;
  mimeType: PlanMimeType;
  source: PlanSource;
  previewUrl: string | null;
}

/** Accepted file types; the magic bytes decide in the end. */
export const PLAN_ACCEPT = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";

/**
 * « Importer un plan »: pick or drop a PDF, PNG or JPEG, check it (format, size, pages, read
 * errors) before any upload, show the page count and a preview of the first page, edit the
 * name, then convert and upload page by page with a progress bar. « Annuler » stops the import
 * and discards the pending plan.
 */
export function ImportPlanDialog({
  siteId,
  open,
  onOpenChange,
  onImported,
}: ImportPlanDialogProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [analysed, setAnalysed] = useState<Analysed | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [overall, setOverall] = useState(0);

  function reset() {
    if (analysed?.previewUrl) URL.revokeObjectURL(analysed.previewUrl);
    analysed?.source.destroy();
    setAnalysed(null);
    setName("");
    setError(null);
    setProgress(null);
    setOverall(0);
  }

  useEffect(() => {
    if (!open) {
      controllerRef.current?.abort();
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on close only
  }, [open]);

  async function analyse(file: File) {
    reset();
    setAnalysing(true);
    try {
      const mimeType = await detectPlanType(file);
      const source =
        mimeType === "application/pdf" ? await openPdfSource(file) : await openImageSource(file);
      let previewUrl: string | null = null;
      try {
        previewUrl = await source.renderPreview(1);
      } catch {
        previewUrl = null;
      }
      setAnalysed({ file, mimeType, source, previewUrl });
      setName(planNameFromFilename(file.name));
    } catch (caught) {
      setError(
        caught instanceof PlanConversionError ? caught.message : "Ce fichier ne peut pas être lu.",
      );
    } finally {
      setAnalysing(false);
    }
  }

  function track(next: ImportProgress) {
    setProgress(next);
    if (!analysed) return;
    const pages = analysed.source.pageCount;
    // The original counts for one slot, each page for one slot.
    if (next.stage === "original")
      setOverall(Math.round((next.percent / 100) * (100 / (pages + 1))));
    if (next.stage === "page") {
      const done = next.page - 1 + (next.step === "upload" ? next.percent / 100 : 0);
      setOverall(Math.round(((1 + done) / (pages + 1)) * 100));
    }
    if (next.stage === "confirm") setOverall(100);
  }

  async function start() {
    if (!analysed) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom du plan est obligatoire.");
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError(null);
    try {
      const plan = await importPlan(
        {
          file: analysed.file,
          name: trimmed,
          mimeType: analysed.mimeType,
          source: analysed.source,
          signal: controller.signal,
          onProgress: track,
        },
        {
          prepare: async (input) => {
            const result = await preparePlanUploadAction({ siteId, ...input });
            return result.ok ? result.upload : { error: result.error };
          },
          preparePages: async (planId, pages) => {
            const result = await preparePageUploadsAction({ planId, pages });
            return result.ok ? result.pages : { error: result.error };
          },
          renew: async (planId) => {
            const result = await renewPlanUploadsAction({ planId });
            return result.ok
              ? { original: result.original, pages: result.pages }
              : { error: result.error };
          },
          confirm: (planId) => confirmPlanUploadAction({ planId }),
          discard: async (planId) => {
            await discardPlanUploadAction({ planId });
          },
          put: putWithProgress,
        },
      );
      // The source was released by the import.
      setAnalysed((current) => (current ? { ...current, previewUrl: current.previewUrl } : null));
      onImported(plan);
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ImportCancelledError) {
        setError("Import annulé.");
      } else {
        setError(
          caught instanceof PlanConversionError ? caught.message : "L'import a échoué. Réessayez.",
        );
      }
      // The source has been destroyed by the import: pick the file again to retry.
      setAnalysed(null);
    } finally {
      setRunning(false);
      controllerRef.current = null;
    }
  }

  function dropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !running) void analyse(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-xl"
        data-testid="import-plan-dialog"
        hideCloseButton={running}
      >
        <DialogHeader>
          <DialogTitle>Importer un plan</DialogTitle>
          <DialogDescription>
            PDF (20 pages au plus), PNG ou JPEG, 50 Mo maximum. Chaque page est convertie en image
            sur cet appareil ; le fichier d&apos;origine est conservé.
          </DialogDescription>
        </DialogHeader>

        {!analysed ? (
          <div
            className={cn(
              "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-rule bg-craie px-4 py-8 text-center",
              dragging && "border-brand bg-brand-tint",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropped}
          >
            <FileUp className="size-8 text-ink-2" aria-hidden="true" />
            <p className="text-ui text-ink-2">Glissez le fichier ici, ou</p>
            <Button
              type="button"
              size="lg"
              loading={analysing}
              onClick={() => inputRef.current?.click()}
              data-testid="pick-plan-file"
            >
              Choisir un fichier
            </Button>
            <input
              ref={inputRef}
              id={`${id}-file`}
              type="file"
              accept={PLAN_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="plan-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void analyse(file);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-rule bg-paper sm:w-48">
              {analysed.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL
                <img
                  src={analysed.previewUrl}
                  alt="Aperçu de la première page"
                  className="max-h-full max-w-full object-contain"
                  data-testid="plan-preview"
                />
              ) : (
                <span className="text-ui text-ink-2">Aperçu indisponible</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="text-ui text-ink-2" data-testid="plan-file-summary">
                {analysed.file.name} · {pagesLabel(analysed.source.pageCount)} ·{" "}
                {formatNumber(Math.round(analysed.file.size / 1024))} Ko
              </p>
              <Field id={`${id}-name`} label="Nom du plan" required>
                {(control) => (
                  <Input
                    {...control}
                    value={name}
                    maxLength={PLAN_NAME_MAX_LENGTH}
                    disabled={running}
                    onChange={(event) => setName(event.target.value)}
                    data-testid="plan-name-input"
                  />
                )}
              </Field>
              {!running ? (
                <Button type="button" variant="ghost" className="self-start" onClick={reset}>
                  <X className="size-4" aria-hidden="true" />
                  Changer de fichier
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {running || progress ? (
          <div className="flex flex-col gap-2" data-testid="plan-import-progress">
            <p className="text-ui text-ink" role="status" aria-live="polite">
              {importProgressLabel(progress)}
            </p>
            <div
              role="progressbar"
              aria-label="Progression de l'import"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overall}
              className="h-2 w-full overflow-hidden rounded-pill bg-galet"
            >
              <div
                className="h-full bg-brand transition-[width]"
                style={{ width: `${overall}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? <ErrorNotice message={error} /> : null}

        <DialogFooter>
          {running ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => controllerRef.current?.abort()}
              data-testid="cancel-plan-import"
            >
              Annuler l&apos;import
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            disabled={!analysed || running}
            loading={running}
            onClick={() => void start()}
            data-testid="start-plan-import"
          >
            Importer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
