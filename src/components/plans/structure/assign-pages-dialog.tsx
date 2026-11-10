"use client";

import { useEffect, useMemo, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  LEVEL_SUGGESTIONS,
  type SiteBuildingView,
  sortBuildings,
  structureLabelError,
} from "@/lib/plans/structure";
import { assignPagesAction } from "@/server/actions/site-structure-actions";
import type { SitePageRef } from "@/server/plans/types";

type Target = "exterior" | "new" | "skip" | `building:${string}`;

interface Row {
  pageNumber: number;
  target: Target;
  buildingName: string;
  label: string;
}

/** Next free « Bâtiment A », « Bâtiment B »… name. */
function nextBuildingName(taken: string[]): string {
  for (let code = 65; code <= 90; code += 1) {
    const name = `Bâtiment ${String.fromCharCode(code)}`;
    if (!taken.some((t) => t.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"))) return name;
  }
  return "Nouveau bâtiment";
}

/** Default rows: the site has no exterior view yet → page 1 of a multi-page PDF is offered as it. */
function defaultRows(
  pages: SitePageRef[],
  buildings: SiteBuildingView[],
  hasExterior: boolean,
): Row[] {
  const active = sortBuildings(buildings.filter((b) => !b.isArchived));
  const newName = nextBuildingName(buildings.map((b) => b.name));
  let level = 0;
  return pages.map((page, index) => {
    if (!hasExterior && index === 0 && pages.length > 1) {
      return { pageNumber: page.pageNumber, target: "exterior", buildingName: newName, label: "" };
    }
    const label = LEVEL_SUGGESTIONS[Math.min(1 + level, LEVEL_SUGGESTIONS.length - 1)] ?? "RDC";
    level += 1;
    return {
      pageNumber: page.pageNumber,
      target: active[0] ? (`building:${active[0].id}` as Target) : "new",
      buildingName: newName,
      label,
    };
  });
}

/**
 * « Affecter les pages », right after a plan import (step 12 b): for each page, the exterior
 * view, a level of an existing building, a level of a new building, or « Ne pas utiliser ».
 * Pages sent to the same new building name share it; levels are added from the bottom up in
 * the order of the pages.
 */
export function AssignPagesDialog({
  open,
  onOpenChange,
  siteId,
  planId,
  planName,
  pages,
  buildings,
  hasExterior,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  planId: string;
  planName: string;
  pages: SitePageRef[];
  buildings: SiteBuildingView[];
  hasExterior: boolean;
  onAssigned: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => defaultRows(pages, buildings, hasExterior));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useMemo(() => sortBuildings(buildings.filter((b) => !b.isArchived)), [buildings]);

  useEffect(() => {
    if (open) {
      setRows(defaultRows(pages, buildings, hasExterior));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when (re)opened only
  }, [open, planId]);

  const update = (pageNumber: number, patch: Partial<Row>) =>
    setRows((list) =>
      list.map((row) => (row.pageNumber === pageNumber ? { ...row, ...patch } : row)),
    );

  async function submit() {
    setError(null);
    if (rows.filter((r) => r.target === "exterior").length > 1) {
      setError("Une seule page peut être la vue extérieure.");
      return;
    }
    for (const row of rows) {
      if (row.target === "skip" || row.target === "exterior") continue;
      const labelError = structureLabelError(row.label, "label");
      if (labelError) {
        setError(`Page ${row.pageNumber} : ${labelError}`);
        return;
      }
      if (row.target === "new") {
        const nameError = structureLabelError(row.buildingName, "name");
        if (nameError) {
          setError(`Page ${row.pageNumber} : ${nameError}`);
          return;
        }
      }
    }
    if (rows.every((r) => r.target === "skip")) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    const result = await assignPagesAction({
      siteId,
      planId,
      assignments: rows.map((row) =>
        row.target === "exterior"
          ? { pageNumber: row.pageNumber, target: "exterior" }
          : row.target === "skip"
            ? { pageNumber: row.pageNumber, target: "skip" }
            : row.target === "new"
              ? {
                  pageNumber: row.pageNumber,
                  target: "new-building",
                  buildingName: row.buildingName,
                  label: row.label,
                }
              : {
                  pageNumber: row.pageNumber,
                  target: "level",
                  buildingId: row.target.slice("building:".length),
                  label: row.label,
                },
      ),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAssigned();
    onOpenChange(false);
  }

  const thumbOf = (pageNumber: number) => pages.find((p) => p.pageNumber === pageNumber)?.thumbUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] max-w-3xl overflow-y-auto"
        data-testid="assign-pages-dialog"
      >
        <DialogHeader>
          <DialogTitle>Affecter les pages</DialogTitle>
          <DialogDescription>
            « {planName} » : choisissez le rôle de chaque page. Les étages d&apos;un bâtiment se
            rangent du bas vers le haut, dans l&apos;ordre des pages.
          </DialogDescription>
        </DialogHeader>
        <datalist id="level-suggestions">
          {LEVEL_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <ol className="flex flex-col gap-3">
          {rows.map((row) => {
            const thumb = thumbOf(row.pageNumber);
            const isLevel = row.target === "new" || row.target.startsWith("building:");
            return (
              <li
                key={row.pageNumber}
                className="grid grid-cols-1 gap-3 rounded-lg border border-rule p-3 sm:grid-cols-[96px_1fr]"
                data-testid="assign-page"
                data-page={row.pageNumber}
              >
                <div className="flex h-20 w-24 items-center justify-center overflow-hidden rounded-md bg-craie">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL
                    <img
                      src={thumb}
                      alt={`Page ${row.pageNumber}`}
                      className="max-h-full max-w-full"
                    />
                  ) : (
                    <span className="text-label text-ink-2">Page {row.pageNumber}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-ui font-semibold">
                    Page {row.pageNumber}
                    <Select
                      value={row.target}
                      onChange={(event) =>
                        update(row.pageNumber, { target: event.target.value as Target })
                      }
                      data-testid={`assign-target-${row.pageNumber}`}
                    >
                      <option value="exterior">Vue extérieure</option>
                      {active.map((building) => (
                        <option key={building.id} value={`building:${building.id}`}>
                          {building.name} (bâtiment existant)
                        </option>
                      ))}
                      <option value="new">Nouveau bâtiment</option>
                      <option value="skip">Ne pas utiliser</option>
                    </Select>
                  </label>
                  {row.target === "new" ? (
                    <label className="flex flex-col gap-1 text-ui">
                      Nom du nouveau bâtiment
                      <Input
                        value={row.buildingName}
                        maxLength={60}
                        onChange={(event) =>
                          update(row.pageNumber, { buildingName: event.target.value })
                        }
                        data-testid={`assign-building-name-${row.pageNumber}`}
                      />
                    </label>
                  ) : null}
                  {isLevel ? (
                    <div className="flex flex-col gap-1">
                      <label className="flex flex-col gap-1 text-ui">
                        Étage
                        <Input
                          value={row.label}
                          maxLength={60}
                          list="level-suggestions"
                          onChange={(event) =>
                            update(row.pageNumber, { label: event.target.value })
                          }
                          data-testid={`assign-label-${row.pageNumber}`}
                        />
                      </label>
                      <div className="flex flex-wrap gap-1" aria-label="Étages proposés">
                        {LEVEL_SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-rule px-3 text-label hover:bg-craie aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand-deep"
                            aria-pressed={row.label === suggestion}
                            onClick={() => update(row.pageNumber, { label: suggestion })}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {error ? <ErrorNotice message={error} /> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Plus tard
          </Button>
          <Button
            type="button"
            loading={busy}
            onClick={() => void submit()}
            data-testid="assign-submit"
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
