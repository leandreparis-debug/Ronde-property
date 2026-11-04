"use client";

import {
  ArrowLeft,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Maximize,
  MapPin,
  Minus,
  Plus,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MarkerPin } from "@/components/plans/marker-pin";
import { MarkerSheet } from "@/components/plans/marker-sheet";
import { ImportPlanDialog } from "@/components/plans/import-plan-dialog";
import { PlanActionsMenu } from "@/components/plans/plan-actions-menu";
import { PlanCard } from "@/components/plans/plan-card";
import { type CanvasMode, PlanCanvas, type PlanCanvasHandle } from "@/components/plans/plan-canvas";
import { useUploadQueue } from "@/components/visits/photos/upload-queue-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Point } from "@/lib/plans/geometry";
import {
  createMarkerAction,
  moveMarkerAction,
  removeMarkerAction,
  renewPlanUrlsAction,
  updateMarkerAction,
} from "@/server/actions/plan-actions";
import type { PhotoView } from "@/server/photos/types";
import type { MarkerView, PlanDetailView, PlanView } from "@/server/plans/types";

export interface PlansTabProps {
  visitId: string;
  siteId: string;
  initialPlans: PlanView[];
  initialMarkers: MarkerView[];
  /** Plan opened from the URL, loaded by the page. */
  initialDetail: PlanDetailView | null;
  photos: PhotoView[];
  zones: Array<{ key: string; label: string }>;
  canEdit: boolean;
  canImport: boolean;
}

/**
 * « Plans » tab of a visit: plans of the site with the markers of this visit, then the viewer
 * of the chosen plan (`?onglet=plans&plan=…&page=…`): page selector, zoom buttons, « Placer un
 * repère » toggle, numbers on / off, original download, markers on the plan, the marker sheet
 * and the list of markers. Read-only when the visit is not editable.
 */
export function PlansTab({
  visitId,
  siteId,
  initialPlans,
  initialMarkers,
  initialDetail,
  photos,
  zones,
  canEdit,
  canImport,
}: PlansTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { uploaded } = useUploadQueue();

  const [plans, setPlans] = useState(initialPlans);
  const [markers, setMarkers] = useState(initialMarkers);
  const [detail, setDetail] = useState<PlanDetailView | null>(initialDetail);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<CanvasMode>("view");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNumbers, setShowNumbers] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<PlanCanvasHandle>(null);

  useEffect(() => setReady(true), []);
  useEffect(() => setPlans(initialPlans), [initialPlans]);
  useEffect(() => setMarkers(initialMarkers), [initialMarkers]);

  const planId = searchParams.get("plan");
  const pageNumber = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const focusMarker = searchParams.get("repere");

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("onglet", "plans");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      const result = await renewPlanUrlsAction({ planId: id, visitId });
      setLoading(false);
      if (result.ok) setDetail(result.plan);
      else setError(result.error);
    },
    [visitId],
  );

  useEffect(() => {
    if (planId && detail?.id !== planId) void loadDetail(planId);
    if (!planId) setDetail(null);
    setMode("view");
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on plan change only
  }, [planId]);

  const page = detail?.pages.find((p) => p.pageNumber === pageNumber) ?? detail?.pages[0] ?? null;
  const planMarkers = useMemo(
    () => markers.filter((m) => m.planId === detail?.id).sort((a, b) => a.number - b.number),
    [markers, detail?.id],
  );
  const pageMarkers = planMarkers.filter((m) => m.page === page?.pageNumber);
  const selected = markers.find((m) => m.id === selectedId) ?? null;
  const nextNumber = planMarkers.reduce((max, m) => Math.max(max, m.number), 0) + 1;
  const archived = detail?.isArchived ?? false;
  const canPlace = canEdit && !archived;

  // Centre on the marker given in the URL (link from the photo viewer).
  useEffect(() => {
    if (!focusMarker || !page) return;
    const marker = pageMarkers.find((m) => m.id === focusMarker);
    if (!marker) return;
    const timer = setTimeout(() => {
      canvasRef.current?.focus({ x: marker.x, y: marker.y });
      setSelectedId(marker.id);
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per marker and page
  }, [focusMarker, page?.pageNumber, detail?.id]);

  // Photos confirmed in the queue join the choices of the marker sheet.
  const allPhotos = useMemo(
    () => [...photos, ...uploaded.filter((u) => !photos.some((p) => p.id === u.id))],
    [photos, uploaded],
  );

  function replaceMarker(next: MarkerView) {
    setMarkers((list) => {
      const exists = list.some((m) => m.id === next.id);
      return exists ? list.map((m) => (m.id === next.id ? next : m)) : [...list, next];
    });
  }

  async function tapPlan(point: Point) {
    if (!detail || !page) return;
    setError(null);
    if (mode === "place") {
      const result = await createMarkerAction({
        visitId,
        planId: detail.id,
        page: page.pageNumber,
        x: point.x,
        y: point.y,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      replaceMarker(result.marker);
      setSelectedId(result.marker.id);
      setMode("view");
      return;
    }
    if (mode === "move" && selected) {
      const result = await moveMarkerAction({ markerId: selected.id, x: point.x, y: point.y });
      if (!result.ok) setError(result.error);
      else replaceMarker(result.marker);
      setMode("view");
    }
  }

  async function dragMarker(marker: MarkerView, point: Point) {
    const result = await moveMarkerAction({ markerId: marker.id, x: point.x, y: point.y });
    if (!result.ok) setError(result.error);
    else replaceMarker(result.marker);
  }

  if (!planId || (!detail && !loading)) {
    return (
      <div
        className="flex flex-col gap-4"
        data-testid="plans-tab"
        data-ready={ready ? "true" : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ui text-ink-2">
            Plans du site : choisissez un plan pour y placer ou consulter les repères.
          </p>
          {canImport ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImporting(true)}
              data-testid="open-plan-import"
            >
              <FileUp className="size-5" aria-hidden="true" />
              Importer un plan pour ce site
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-ui font-medium text-status-open">
            {error}
          </p>
        ) : null}
        {plans.length === 0 ? (
          <EmptyState
            mood="asleep"
            title="Aucun plan pour ce site"
            description={
              canImport
                ? "Importez l'export AutoCAD du site (PDF, PNG ou JPEG) pour y placer les repères de la visite."
                : "Les plans du site apparaîtront ici."
            }
          />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Plans du site">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="flex items-center gap-2 rounded-lg border border-rule bg-paper p-3"
                data-testid="visit-plan"
              >
                <button
                  type="button"
                  className="flex min-h-touch-lg min-w-0 flex-1 rounded-md text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  onClick={() => setParams({ plan: plan.id, page: null, repere: null })}
                  aria-label={`Ouvrir le plan ${plan.name}`}
                >
                  <PlanCard plan={plan} showMarkers />
                </button>
                {canImport ? (
                  <PlanActionsMenu
                    plan={plan}
                    onChanged={(next) =>
                      setPlans((list) =>
                        list.map((p) =>
                          p.id === next.id
                            ? {
                                ...next,
                                markersCount: p.markersCount,
                                thumbUrl: next.thumbUrl ?? p.thumbUrl,
                              }
                            : p,
                        ),
                      )
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canImport ? (
          <ImportPlanDialog
            siteId={siteId}
            open={importing}
            onOpenChange={setImporting}
            onImported={(plan) => {
              setPlans((list) => [...list, plan]);
              toast({ variant: "success", title: `Plan « ${plan.name} » importé` });
              router.refresh();
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="plans-tab"
      data-ready={ready ? "true" : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setParams({ plan: null, page: null, repere: null })}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
          Plans
        </Button>
        <h3
          className="min-w-0 flex-1 truncate font-display text-title-sm text-ink"
          data-testid="plan-viewer-title"
        >
          {detail?.name ?? "…"}
          {archived ? (
            <span className="ml-2 align-middle text-ui font-semibold text-ink-2">· Archivé</span>
          ) : null}
        </h3>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Outils du plan">
        {detail && detail.pages.length > 1 ? (
          <label className="flex items-center gap-2 text-ui text-ink-2">
            <span className="sr-only sm:not-sr-only">Page</span>
            <Select
              value={String(page?.pageNumber ?? 1)}
              onChange={(event) => setParams({ page: event.target.value, repere: null })}
              aria-label="Page du plan"
              data-testid="plan-page-select"
              className="w-28"
            >
              {detail.pages.map((p) => (
                <option key={p.pageNumber} value={p.pageNumber}>
                  Page {p.pageNumber}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <Button
            type="button"
            variant="secondary"
            onClick={() => canvasRef.current?.zoomOut()}
            aria-label="Dézoomer"
            data-testid="zoom-out"
          >
            <Minus className="size-5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => canvasRef.current?.zoomIn()}
            aria-label="Zoomer"
            data-testid="zoom-in"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => canvasRef.current?.fit()}
            data-testid="zoom-fit"
          >
            <Maximize className="size-4" aria-hidden="true" />
            Ajuster
          </Button>
        </div>
        <Button
          type="button"
          variant="secondary"
          aria-pressed={showNumbers}
          onClick={() => setShowNumbers((v) => !v)}
        >
          {showNumbers ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
          {showNumbers ? "Masquer les numéros" : "Afficher les numéros"}
        </Button>
        {detail?.originalUrl ? (
          <Button asChild variant="ghost">
            <a href={detail.originalUrl} download data-testid="plan-download-original">
              <Download className="size-4" aria-hidden="true" />
              Télécharger l&apos;original
            </a>
          </Button>
        ) : null}
        {canPlace ? (
          <Button
            type="button"
            variant={mode === "place" ? "primary" : "secondary"}
            aria-pressed={mode === "place"}
            onClick={() => setMode((m) => (m === "place" ? "view" : "place"))}
            data-testid="toggle-place-marker"
            className={cn(mode === "place" && "ring-3 ring-brand-soft")}
          >
            <MapPin className="size-5" aria-hidden="true" />
            Placer un repère
          </Button>
        ) : null}
      </div>

      {mode === "place" ? (
        <p
          className="rounded-md bg-brand-soft px-3 py-2 text-ui font-semibold text-brand-deep"
          role="status"
          data-testid="place-hint"
        >
          Touchez le plan pour placer le repère n° {nextNumber}
        </p>
      ) : mode === "move" && selected ? (
        <p
          className="rounded-md bg-brand-soft px-3 py-2 text-ui font-semibold text-brand-deep"
          role="status"
        >
          Touchez le plan pour déplacer le repère n° {selected.number}
        </p>
      ) : canEdit && archived ? (
        <p className="rounded-md bg-craie px-3 py-2 text-ui text-ink-2" role="status">
          Plan archivé : les repères existants restent modifiables, aucun nouveau repère.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-ui font-medium text-status-open">
          {error}
        </p>
      ) : null}

      <div className={cn("grid grid-cols-1 gap-4", selected && "lg:grid-cols-[1fr_360px]")}>
        <div className="flex min-w-0 flex-col gap-4">
          {page ? (
            <PlanCanvas
              ref={canvasRef}
              page={page}
              markers={pageMarkers}
              mode={mode}
              selectedId={selectedId}
              showNumbers={showNumbers}
              canDragMarkers={canEdit}
              onTapPlan={(point) => void tapPlan(point)}
              onSelectMarker={(marker) => {
                setSelectedId(marker.id);
                if (mode === "move") setMode("view");
              }}
              onDragMarker={(marker, point) => void dragMarker(marker, point)}
              onImageError={() => detail && void loadDetail(detail.id)}
            />
          ) : (
            <div className="flex h-[60dvh] items-center justify-center rounded-lg border border-rule bg-craie text-ui text-ink-2">
              Chargement du plan…
            </div>
          )}

          <section aria-labelledby="markers-list-title" className="flex flex-col gap-2">
            <h4 id="markers-list-title" className="label-caps text-ink-2">
              Repères de cette visite sur ce plan
            </h4>
            {planMarkers.length === 0 ? (
              <p className="text-ui text-ink-2">
                {canPlace
                  ? "Aucun repère : activez « Placer un repère » puis touchez le plan."
                  : "Aucun repère."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="markers-list">
                {planMarkers.map((marker) => (
                  <li key={marker.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-touch w-full items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-galet",
                        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        selectedId === marker.id && "bg-brand-tint",
                      )}
                      onClick={() => {
                        if (marker.page !== page?.pageNumber)
                          setParams({ page: String(marker.page), repere: marker.id });
                        else canvasRef.current?.focus({ x: marker.x, y: marker.y });
                        setSelectedId(marker.id);
                      }}
                      data-testid="markers-list-item"
                    >
                      <MarkerPin number={marker.number} hasPhoto={Boolean(marker.photoId)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-semibold text-ink">
                          n° {marker.number}
                          {marker.label ? ` · ${marker.label}` : ""}
                        </span>
                        <span className="block text-label text-ink-2">
                          Page {marker.page}
                          {marker.photoId ? "" : " · sans photo"}
                        </span>
                      </span>
                      {marker.photoThumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img
                          src={marker.photoThumbUrl}
                          alt=""
                          loading="lazy"
                          width={48}
                          height={36}
                          className="rounded h-9 w-12 object-cover"
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {selected && detail ? (
          <MarkerSheet
            key={selected.id}
            marker={selected}
            planName={detail.name}
            photos={allPhotos}
            zones={zones}
            canEdit={canEdit}
            moving={mode === "move"}
            onClose={() => {
              setSelectedId(null);
              setMode("view");
            }}
            onStartMove={() => setMode((m) => (m === "move" ? "view" : "move"))}
            onUpdate={async (patch) => {
              const result = await updateMarkerAction({ markerId: selected.id, ...patch });
              if (!result.ok) return result.error;
              replaceMarker(result.marker);
              return null;
            }}
            onDelete={async () => {
              const result = await removeMarkerAction({ markerId: selected.id, visitId });
              if (!result.ok) return result.error;
              setMarkers((list) => list.filter((m) => m.id !== selected.id));
              setSelectedId(null);
              toast({ variant: "success", title: `Repère n° ${selected.number} supprimé` });
              return null;
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
