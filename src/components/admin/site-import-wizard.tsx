"use client";

import { FileUp } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  applySitesImportAction,
  type ImportActionState,
  simulateSitesImportAction,
} from "@/server/actions/site-actions";
import type { ImportReport as Report } from "@/server/sites/import";

import { ImportReport } from "./import-report";

const initial: ImportActionState = { ok: false };

function describe(counts: Report["plan"]["counts"]): string {
  const parts = [
    `${counts.create} créé${counts.create > 1 ? "s" : ""}`,
    `${counts.update} mis à jour`,
    `${counts.reactivate} réactivé${counts.reactivate > 1 ? "s" : ""}`,
    `${counts.deactivate} désactivé${counts.deactivate > 1 ? "s" : ""}`,
    `${counts.unchanged} inchangé${counts.unchanged > 1 ? "s" : ""}`,
    `${counts.reject} rejeté${counts.reject > 1 ? "s" : ""}`,
  ];
  return parts.join(", ");
}

/**
 * Three-step import: file and options, simulation report, confirmed application.
 * The file never leaves the browser between the two steps except as the upload itself.
 */
export function SiteImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [fullReferential, setFullReferential] = useState(false);
  const [emptyClearsValue, setEmptyClearsValue] = useState(false);
  const [confirmMass, setConfirmMass] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [simulation, simulate, simulating] = useActionState(simulateSitesImportAction, initial);
  const [application, apply, applying] = useActionState(applySitesImportAction, initial);

  const report =
    application.ok && application.report
      ? application.report
      : simulation.ok
        ? simulation.report
        : undefined;
  const applied = application.ok && Boolean(application.report);

  useEffect(() => {
    if (application.ok && application.report) {
      setConfirmOpen(false);
      toast({
        variant: "success",
        title: "Référentiel mis à jour",
        description: describe(application.report.plan.counts),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [application.tick]);

  function buildFormData(extra?: Record<string, string>): FormData {
    const data = new FormData();
    if (file) data.set("file", file);
    data.set("fullReferential", String(fullReferential));
    data.set("emptyClearsValue", String(emptyClearsValue));
    for (const [key, value] of Object.entries(extra ?? {})) data.set(key, value);
    return data;
  }

  function onFiles(files: FileList | null) {
    const next = files?.[0] ?? null;
    setFile(next);
    setConfirmMass(false);
  }

  const expected =
    simulation.ok && simulation.report
      ? { sha256: simulation.report.sha256, counts: simulation.report.plan.counts }
      : null;
  const canApply = Boolean(file && expected && !applied && !simulating);
  const guard = simulation.ok && simulation.report?.plan.guard.requiresConfirmation;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5 p-5 md:p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            simulate(buildFormData());
          }}
          className="flex flex-col gap-5"
        >
          <label
            htmlFor="import-file"
            className={cn(
              "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center text-ui",
              dragging ? "border-brand bg-brand-soft" : "border-rule bg-craie hover:border-brand",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              onFiles(event.dataTransfer.files);
            }}
          >
            <FileUp className="size-8 text-brand" aria-hidden="true" />
            <span className="font-semibold text-ink">
              {file ? file.name : "Déposez l'export VIGIE ici ou choisissez un fichier"}
            </span>
            <span className="text-ink-2">
              CSV ou TXT, séparateur ; ou , · 5 Mo et 5 000 lignes maximum
            </span>
            <input
              ref={inputRef}
              id="import-file"
              name="file"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => onFiles(event.target.files)}
            />
          </label>

          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 text-ui">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-brand"
                checked={fullReferential}
                onChange={(event) => {
                  setFullReferential(event.target.checked);
                  setConfirmMass(false);
                }}
              />
              <span>
                <span className="font-semibold text-ink">
                  Ce fichier contient tout le référentiel
                </span>
                <span className="block text-ink-2">
                  Les sites actifs absents du fichier seront désactivés. Décoché, aucun site
                  n&apos;est désactivé par absence.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-ui">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-brand"
                checked={emptyClearsValue}
                onChange={(event) => setEmptyClearsValue(event.target.checked)}
              />
              <span>
                <span className="font-semibold text-ink">
                  Une cellule vide efface la valeur existante
                </span>
                <span className="block text-ink-2">
                  Décoché, une cellule vide conserve la valeur déjà enregistrée.
                </span>
              </span>
            </label>
          </div>

          {simulation.error ? <ErrorNotice message={simulation.error} /> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" loading={simulating} disabled={!file}>
              Simuler l&apos;import
            </Button>
            <Button
              type="button"
              size="lg"
              variant="primary"
              disabled={!canApply || (guard && !confirmMass)}
              onClick={() => setConfirmOpen(true)}
            >
              Appliquer l&apos;import
            </Button>
          </div>
          {guard ? (
            <label className="flex items-start gap-3 text-ui">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-brand"
                checked={confirmMass}
                onChange={(event) => setConfirmMass(event.target.checked)}
              />
              <span className="font-semibold text-status-open">
                Je confirme la désactivation massive décrite dans le rapport
              </span>
            </label>
          ) : null}
        </form>
      </Card>

      {application.error ? <ErrorNotice message={application.error} /> : null}
      {report ? <ImportReport report={report} /> : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appliquer l&apos;import ?</DialogTitle>
            <DialogDescription>
              {expected ? describe(expected.counts) : ""}. Les modifications seront écrites en une
              seule transaction et tracées.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!expected) return;
              apply(
                buildFormData({
                  expected: JSON.stringify(expected),
                  confirmMassDeactivation: String(confirmMass),
                }),
              );
            }}
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" loading={applying}>
                Confirmer l&apos;application
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
