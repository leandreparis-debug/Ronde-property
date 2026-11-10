"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Building2,
  FileUp,
  Hexagon,
  ImageOff,
  Pencil,
  Plus,
  Replace,
  Trees,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { ImportPlanDialog } from "@/components/plans/import-plan-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  LEVEL_SUGGESTIONS,
  type SiteViewView,
  sortBuildings,
  structureLabelError,
} from "@/lib/plans/structure";
import {
  createBuildingAction,
  getSiteStructureAction,
  renameBuildingAction,
  renameViewAction,
  reorderBuildingsAction,
  reorderViewsAction,
  replaceViewImageAction,
  setBuildingArchivedAction,
  setViewArchivedAction,
  type StructureResult,
} from "@/server/actions/site-structure-actions";
import type { SitePageRef, SiteStructureView } from "@/server/plans/types";

import { AssignPagesDialog } from "./assign-pages-dialog";
import { OutlineEditor } from "./outline-editor";

type Rename =
  | { kind: "building"; id: string; value: string }
  | { kind: "view"; id: string; value: string }
  | { kind: "new-building"; value: string };

function Thumb({ page, label }: { page: SitePageRef | undefined; label: string }) {
  return (
    <span className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-rule bg-craie">
      {page?.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL
        <img src={page.thumbUrl} alt={label} className="max-h-full max-w-full" />
      ) : (
        <ImageOff className="size-5 text-ink-2" aria-hidden="true" />
      )}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="px-0"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

/**
 * « Bâtiments et étages » on the site page (step 12 b), in place of the « Plans » list: the
 * exterior view, the buildings and their levels (from the bottom up) with their thumbnails.
 * RT and admin import a plan and assign its pages, rename, reorder (up / down buttons), replace
 * the image of a level, archive, and trace the outlines on the exterior view. The direction
 * reads the same tree. Online only: the structure is then copied with the visits kept offline.
 */
export function SiteStructureSection({
  siteId,
  initial,
  canEdit,
}: {
  siteId: string;
  initial: SiteStructureView;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [structure, setStructure] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState<{ planId: string; planName: string } | null>(null);
  const [tracing, setTracing] = useState<string | null | undefined>(undefined);
  const [rename, setRename] = useState<Rename | null>(null);
  const [replacing, setReplacing] = useState<SiteViewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setStructure(initial), [initial]);

  const pageOf = (view: Pick<SiteViewView, "planId" | "pageNumber">) =>
    structure.pages.find((p) => p.planId === view.planId && p.pageNumber === view.pageNumber);
  const exterior = structure.views.find((v) => v.kind === "exterior" && !v.isArchived) ?? null;
  const exteriorPage = exterior ? pageOf(exterior) : undefined;
  const buildings = useMemo(
    () => sortBuildings(structure.buildings.filter((b) => showArchived || !b.isArchived)),
    [structure.buildings, showArchived],
  );
  const levelsOf = (buildingId: string) =>
    structure.views
      .filter((v) => v.buildingId === buildingId && (showArchived || !v.isArchived))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const unassigned = structure.pages.filter((p) => !p.viewId && !p.planArchived);
  const unassignedPlans = [...new Map(unassigned.map((p) => [p.planId, p.planName])).entries()];

  async function reload() {
    const result = await getSiteStructureAction({ siteId });
    if (result.ok) setStructure(result.value);
    router.refresh();
  }

  async function act<T>(work: Promise<StructureResult<T>>, success?: string) {
    setBusy(true);
    setError(null);
    const result = await work;
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    if (success) toast({ variant: "success", title: success });
    await reload();
    return true;
  }

  function move<T extends { id: string }>(list: T[], index: number, delta: number): string[] {
    const ids = list.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return ids;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    return ids;
  }

  async function submitRename() {
    if (!rename) return;
    const what = rename.kind === "view" ? "label" : "name";
    const problem = structureLabelError(rename.value, what);
    if (problem) {
      setError(problem);
      return;
    }
    const ok = await act<unknown>(
      rename.kind === "building"
        ? renameBuildingAction({ id: rename.id, name: rename.value })
        : rename.kind === "view"
          ? renameViewAction({ id: rename.id, name: rename.value })
          : createBuildingAction({ siteId, name: rename.value }),
      rename.kind === "new-building" ? "Bâtiment ajouté" : "Nom enregistré",
    );
    if (ok) setRename(null);
  }

  const activeBuildings = sortBuildings(structure.buildings.filter((b) => !b.isArchived));
  const nothing = structure.views.filter((v) => !v.isArchived).length === 0;

  return (
    <Card data-testid="site-structure">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Bâtiments et étages</CardTitle>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImporting(true)}
              data-testid="open-plan-import"
            >
              <FileUp className="size-5" aria-hidden="true" />
              Importer un plan
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRename({ kind: "new-building", value: "" })}
              data-testid="structure-new-building"
            >
              <Plus className="size-5" aria-hidden="true" />
              Nouveau bâtiment
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <ErrorNotice message={error} /> : null}

        {canEdit && unassignedPlans.length > 0 ? (
          <div
            className="flex flex-col gap-2 rounded-lg bg-brand-tint p-3"
            data-testid="structure-unassigned"
          >
            <p className="text-ui text-ink">
              {unassigned.length} page{unassigned.length > 1 ? "s" : ""} de plan sans rôle :
              affectez-les à la vue extérieure ou à un étage.
            </p>
            <div className="flex flex-wrap gap-2">
              {unassignedPlans.map(([planId, planName]) => (
                <Button
                  key={planId}
                  type="button"
                  variant="secondary"
                  onClick={() => setAssigning({ planId, planName })}
                  data-testid="structure-assign"
                >
                  Affecter les pages de « {planName} »
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {nothing && buildings.length === 0 ? (
          <EmptyState
            mood="asleep"
            title="Aucun plan pour ce site"
            description={
              canEdit
                ? "Importez l'export AutoCAD du site (PDF, PNG ou JPEG), puis affectez ses pages à la vue extérieure et aux étages des bâtiments."
                : "La vue extérieure et les étages du site apparaîtront ici."
            }
            className="py-6"
          />
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Vues du site">
            <li
              className="flex flex-wrap items-center gap-3 rounded-lg border border-rule p-3"
              data-testid="structure-exterior"
            >
              <Trees className="size-5 text-ink-2" aria-hidden="true" />
              <Thumb page={exteriorPage} label="Vue extérieure" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold">Vue extérieure</span>
                <span className="text-label text-ink-2">
                  {exterior
                    ? `${activeBuildings.filter((b) => b.outline).length} contour${activeBuildings.filter((b) => b.outline).length > 1 ? "s" : ""} tracé${activeBuildings.filter((b) => b.outline).length > 1 ? "s" : ""} sur ${activeBuildings.length} bâtiment${activeBuildings.length > 1 ? "s" : ""}`
                    : "Aucune : affectez une page à la vue extérieure pour y dessiner les bâtiments."}
                </span>
              </div>
              {canEdit && exterior ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={activeBuildings.length === 0}
                    onClick={() =>
                      setTracing(
                        activeBuildings.find((b) => !b.outline)?.id ??
                          activeBuildings[0]?.id ??
                          null,
                      )
                    }
                    data-testid="structure-trace"
                  >
                    <Hexagon className="size-5" aria-hidden="true" />
                    Tracer les contours
                  </Button>
                  <IconButton
                    label="Remplacer l'image de la vue extérieure"
                    onClick={() => setReplacing(exterior)}
                    testId="structure-replace"
                  >
                    <Replace className="size-5" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label="Archiver la vue extérieure"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        setViewArchivedAction({ id: exterior.id, archived: true }),
                        "Vue extérieure archivée",
                      )
                    }
                    testId="structure-archive"
                  >
                    <Archive className="size-5" aria-hidden="true" />
                  </IconButton>
                </div>
              ) : null}
            </li>

            {buildings.map((building, buildingIndex) => {
              const levels = levelsOf(building.id);
              return (
                <li
                  key={building.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border border-rule p-3",
                    building.isArchived && "opacity-70",
                  )}
                  data-testid="structure-building"
                  data-name={building.name}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="size-5 text-ink-2" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-body font-semibold">{building.name}</span>
                    {building.isArchived ? <Badge>Archivé</Badge> : null}
                    {building.outline ? (
                      <Badge variant="brand">Contour tracé</Badge>
                    ) : (
                      <Badge>Sans contour</Badge>
                    )}
                    {canEdit && !building.isArchived ? (
                      <div className="flex flex-wrap gap-1">
                        <IconButton
                          label={`Monter ${building.name}`}
                          disabled={busy || buildingIndex === 0}
                          onClick={() =>
                            void act(
                              reorderBuildingsAction({
                                siteId,
                                orderedIds: move(
                                  buildings.filter((b) => !b.isArchived),
                                  buildingIndex,
                                  -1,
                                ),
                              }),
                            )
                          }
                          testId="structure-up"
                        >
                          <ArrowUp className="size-5" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Descendre ${building.name}`}
                          disabled={
                            busy ||
                            buildingIndex === buildings.filter((b) => !b.isArchived).length - 1
                          }
                          onClick={() =>
                            void act(
                              reorderBuildingsAction({
                                siteId,
                                orderedIds: move(
                                  buildings.filter((b) => !b.isArchived),
                                  buildingIndex,
                                  1,
                                ),
                              }),
                            )
                          }
                          testId="structure-down"
                        >
                          <ArrowDown className="size-5" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Renommer ${building.name}`}
                          onClick={() =>
                            setRename({ kind: "building", id: building.id, value: building.name })
                          }
                          testId="structure-rename"
                        >
                          <Pencil className="size-5" aria-hidden="true" />
                        </IconButton>
                        {exterior ? (
                          <IconButton
                            label={`Tracer le contour de ${building.name}`}
                            onClick={() => setTracing(building.id)}
                          >
                            <Hexagon className="size-5" aria-hidden="true" />
                          </IconButton>
                        ) : null}
                        <IconButton
                          label={`Archiver ${building.name}`}
                          disabled={busy}
                          onClick={() =>
                            void act(
                              setBuildingArchivedAction({ id: building.id, archived: true }),
                              `${building.name} archivé`,
                            )
                          }
                          testId="structure-archive"
                        >
                          <Archive className="size-5" aria-hidden="true" />
                        </IconButton>
                      </div>
                    ) : null}
                    {canEdit && building.isArchived ? (
                      <IconButton
                        label={`Désarchiver ${building.name}`}
                        onClick={() =>
                          void act(setBuildingArchivedAction({ id: building.id, archived: false }))
                        }
                      >
                        <ArchiveRestore className="size-5" aria-hidden="true" />
                      </IconButton>
                    ) : null}
                  </div>
                  {levels.length === 0 ? (
                    <p className="text-label text-ink-2">
                      Aucun étage : affectez une page de plan à ce bâtiment.
                    </p>
                  ) : (
                    <ol
                      className="flex flex-col gap-2"
                      aria-label={`Étages de ${building.name}, du bas vers le haut`}
                    >
                      {levels.map((view, index) => {
                        const activeLevels = levels.filter((v) => !v.isArchived);
                        const activeIndex = activeLevels.findIndex((v) => v.id === view.id);
                        return (
                          <li
                            key={view.id}
                            className={cn(
                              "flex flex-wrap items-center gap-3 rounded-md bg-craie p-2",
                              view.isArchived && "opacity-70",
                            )}
                            data-testid="structure-level"
                            data-label={view.label}
                            data-index={index}
                          >
                            <Thumb page={pageOf(view)} label={view.label} />
                            <span className="min-w-0 flex-1 text-ui font-semibold">
                              {view.label}
                            </span>
                            {view.isArchived ? (
                              <Badge>{view.replacedBy ? "Ancienne image" : "Archivée"}</Badge>
                            ) : null}
                            {canEdit && !view.isArchived ? (
                              <div className="flex flex-wrap gap-1">
                                <IconButton
                                  label={`Descendre ${view.label} d'un étage`}
                                  disabled={busy || activeIndex === 0}
                                  onClick={() =>
                                    void act(
                                      reorderViewsAction({
                                        buildingId: building.id,
                                        orderedIds: move(activeLevels, activeIndex, -1),
                                      }),
                                    )
                                  }
                                  testId="structure-level-down"
                                >
                                  <ArrowDown className="size-5" aria-hidden="true" />
                                </IconButton>
                                <IconButton
                                  label={`Monter ${view.label} d'un étage`}
                                  disabled={busy || activeIndex === activeLevels.length - 1}
                                  onClick={() =>
                                    void act(
                                      reorderViewsAction({
                                        buildingId: building.id,
                                        orderedIds: move(activeLevels, activeIndex, 1),
                                      }),
                                    )
                                  }
                                  testId="structure-level-up"
                                >
                                  <ArrowUp className="size-5" aria-hidden="true" />
                                </IconButton>
                                <IconButton
                                  label={`Renommer ${view.label}`}
                                  onClick={() =>
                                    setRename({ kind: "view", id: view.id, value: view.label })
                                  }
                                  testId="structure-rename"
                                >
                                  <Pencil className="size-5" aria-hidden="true" />
                                </IconButton>
                                <IconButton
                                  label={`Remplacer l'image de ${view.label}`}
                                  onClick={() => setReplacing(view)}
                                  testId="structure-replace"
                                >
                                  <Replace className="size-5" aria-hidden="true" />
                                </IconButton>
                                <IconButton
                                  label={`Archiver ${view.label}`}
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      setViewArchivedAction({ id: view.id, archived: true }),
                                      `${view.label} archivé`,
                                    )
                                  }
                                  testId="structure-archive"
                                >
                                  <Archive className="size-5" aria-hidden="true" />
                                </IconButton>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {canEdit && structure.buildings.some((b) => b.isArchived) ? (
          <label className="flex min-h-11 items-center gap-2 text-ui">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Afficher les bâtiments et étages archivés
          </label>
        ) : null}
      </CardContent>

      {canEdit ? (
        <>
          <ImportPlanDialog
            siteId={siteId}
            open={importing}
            onOpenChange={setImporting}
            onImported={(plan) => {
              toast({ variant: "success", title: `Plan « ${plan.name} » importé` });
              void reload().then(() => setAssigning({ planId: plan.id, planName: plan.name }));
            }}
          />
          {assigning ? (
            <AssignPagesDialog
              open
              onOpenChange={(open) => (open ? undefined : setAssigning(null))}
              siteId={siteId}
              planId={assigning.planId}
              planName={assigning.planName}
              pages={structure.pages.filter((p) => p.planId === assigning.planId && !p.viewId)}
              buildings={structure.buildings}
              hasExterior={Boolean(exterior)}
              onAssigned={() => {
                toast({ variant: "success", title: "Pages affectées" });
                void reload();
              }}
            />
          ) : null}
          {exteriorPage && tracing !== undefined ? (
            <OutlineEditor
              open
              onOpenChange={(open) => (open ? undefined : setTracing(undefined))}
              exterior={exteriorPage}
              buildings={structure.buildings}
              initialBuildingId={tracing}
              onSaved={() => {
                toast({ variant: "success", title: "Contour enregistré" });
                void reload();
              }}
            />
          ) : null}
          <Dialog
            open={rename !== null}
            onOpenChange={(open) => (open ? undefined : setRename(null))}
          >
            <DialogContent data-testid="structure-rename-dialog">
              <DialogHeader>
                <DialogTitle>
                  {rename?.kind === "new-building"
                    ? "Nouveau bâtiment"
                    : rename?.kind === "view"
                      ? "Renommer l'étage"
                      : "Renommer le bâtiment"}
                </DialogTitle>
                <DialogDescription>60 caractères au plus.</DialogDescription>
              </DialogHeader>
              <Input
                aria-label={rename?.kind === "view" ? "Étage" : "Nom du bâtiment"}
                value={rename?.value ?? ""}
                maxLength={60}
                list={rename?.kind === "view" ? "structure-level-suggestions" : undefined}
                onChange={(event) =>
                  setRename((r) => (r ? { ...r, value: event.target.value } : r))
                }
                data-testid="structure-rename-input"
              />
              <datalist id="structure-level-suggestions">
                {LEVEL_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setRename(null)}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  loading={busy}
                  onClick={() => void submitRename()}
                  data-testid="structure-rename-save"
                >
                  Enregistrer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={replacing !== null}
            onOpenChange={(open) => (open ? undefined : setReplacing(null))}
          >
            <DialogContent
              className="max-h-[90dvh] max-w-2xl overflow-y-auto"
              data-testid="structure-replace-dialog"
            >
              <DialogHeader>
                <DialogTitle>Remplacer l&apos;image</DialogTitle>
                <DialogDescription>
                  Les repères déjà posés restent sur l&apos;ancienne image, visible dans les visites
                  passées. Les nouvelles visites utilisent la nouvelle.
                </DialogDescription>
              </DialogHeader>
              {unassigned.length === 0 ? (
                <p className="text-ui text-ink-2">
                  Aucune page libre : importez d&apos;abord le nouveau plan, puis choisissez « Plus
                  tard » dans « Affecter les pages ».
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {unassigned.map((page) => (
                    <li key={`${page.planId}:${page.pageNumber}`}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-center gap-1 rounded-md border border-rule p-2 hover:bg-craie focus-visible:outline-3 focus-visible:outline-brand"
                        onClick={async () => {
                          if (!replacing) return;
                          const ok = await act(
                            replaceViewImageAction({
                              viewId: replacing.id,
                              planId: page.planId,
                              pageNumber: page.pageNumber,
                            }),
                            "Image remplacée",
                          );
                          if (ok) setReplacing(null);
                        }}
                        data-testid="structure-replace-page"
                      >
                        <Thumb page={page} label={`${page.planName}, page ${page.pageNumber}`} />
                        <span className="text-label">
                          {page.planName} · p. {page.pageNumber}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </Card>
  );
}
