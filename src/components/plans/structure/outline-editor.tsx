"use client";

import { Check, Eraser, Undo2 } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  OUTLINE_MAX_POINTS,
  outlineCenter,
  outlineError,
  type RelativePoint,
  type SiteBuildingView,
  sortBuildings,
} from "@/lib/plans/structure";
import { setBuildingOutlineAction } from "@/server/actions/site-structure-actions";
import type { SitePageRef } from "@/server/plans/types";

/** Distance under which a pointer that lifts counts as a tap (CSS pixels). */
const TAP_TRAVEL = 8;

/**
 * « Tracer le contour » of a building on the exterior view (step 12 b): touch the corners one by
 * one, « Annuler le dernier point », then « Terminer ». The points stay movable with a finger or
 * the mouse. The outline is checked (3 to 24 points, never crossing itself) before it is saved.
 */
export function OutlineEditor({
  open,
  onOpenChange,
  exterior,
  buildings,
  initialBuildingId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exterior: SitePageRef;
  buildings: SiteBuildingView[];
  initialBuildingId: string | null;
  onSaved: () => void;
}) {
  const active = sortBuildings(buildings.filter((b) => !b.isArchived));
  const [buildingId, setBuildingId] = useState<string>(initialBuildingId ?? active[0]?.id ?? "");
  const [points, setPoints] = useState<RelativePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const surface = useRef<SVGSVGElement>(null);
  const gesture = useRef<{
    index: number | null;
    travel: number;
    last: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = initialBuildingId ?? active[0]?.id ?? "";
    setBuildingId(id);
    setPoints(buildings.find((b) => b.id === id)?.outline ?? []);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when (re)opened only
  }, [open, initialBuildingId]);

  function choose(id: string) {
    setBuildingId(id);
    setPoints(buildings.find((b) => b.id === id)?.outline ?? []);
    setError(null);
  }

  function relative(event: { clientX: number; clientY: number }): RelativePoint {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>, index: number | null) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    surface.current?.setPointerCapture(event.pointerId);
    gesture.current = { index, travel: 0, last: { x: event.clientX, y: event.clientY } };
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    g.travel += Math.hypot(event.clientX - g.last.x, event.clientY - g.last.y);
    g.last = { x: event.clientX, y: event.clientY };
    if (g.index !== null && g.travel > 2) {
      const point = relative(event);
      setPoints((list) => list.map((p, i) => (i === g.index ? point : p)));
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || event.type === "pointercancel") return;
    // A tap on the image (not on a point) adds a corner.
    if (g.index === null && g.travel < TAP_TRAVEL) {
      if (points.length >= OUTLINE_MAX_POINTS) {
        setError(`Un contour a au plus ${OUTLINE_MAX_POINTS} points.`);
        return;
      }
      setPoints((list) => [...list, relative(event)]);
      setError(null);
    }
  }

  async function save(outline: RelativePoint[] | null) {
    if (outline) {
      const problem = outlineError(outline);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    const result = await setBuildingOutlineAction({ id: buildingId, outline });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  const others = active.filter((b) => b.id !== buildingId && b.outline);
  const ratio = exterior.width / exterior.height;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[96dvh] max-w-5xl overflow-y-auto"
        data-testid="outline-editor"
      >
        <DialogHeader>
          <DialogTitle>Tracer le contour</DialogTitle>
          <DialogDescription>
            Touchez les coins du bâtiment un par un sur la vue extérieure, puis « Terminer ». Les
            points se déplacent au doigt ou à la souris.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-ui font-semibold">
          Bâtiment
          <Select
            value={buildingId}
            onChange={(event) => choose(event.target.value)}
            data-testid="outline-building"
          >
            {active.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
                {building.outline ? " (contour tracé)" : ""}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex justify-center">
          <div
            className="relative w-full max-w-full overflow-hidden rounded-lg border border-rule bg-craie"
            style={{
              aspectRatio: `${ratio}`,
              maxHeight: "58dvh",
              maxWidth: `calc(58dvh * ${ratio})`,
            }}
          >
            {exterior.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL
              <img
                src={exterior.imageUrl}
                alt="Vue extérieure du site"
                className="pointer-events-none absolute inset-0 size-full select-none"
                draggable={false}
              />
            ) : null}
            <svg
              ref={surface}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full cursor-crosshair touch-none"
              role="application"
              aria-label="Image de la vue extérieure : touchez pour ajouter un coin"
              data-testid="outline-surface"
              data-points={points.length}
              onPointerDown={(event) => onPointerDown(event, null)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {others.map((building) => (
                <g key={building.id}>
                  <polygon
                    points={building.outline!.map((p) => `${p.x},${p.y}`).join(" ")}
                    className="fill-ink/10 stroke-ink-2"
                    strokeWidth={0.003}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
              {points.length > 1 ? (
                <polygon
                  points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                  className="fill-brand/20 stroke-brand"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            {others.map((building) => {
              const center = outlineCenter(building.outline!);
              return (
                <span
                  key={building.id}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-pill bg-paper/90 px-2 text-label text-ink-2"
                  style={{ left: `${center.x * 100}%`, top: `${center.y * 100}%` }}
                >
                  {building.name}
                </span>
              );
            })}
            {/* Handles: HTML buttons of 44 px, outside the stretched SVG so they stay round. */}
            {points.map((point, index) => (
              <button
                key={index}
                type="button"
                className={cn(
                  "absolute flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full",
                  "focus-visible:outline-3 focus-visible:outline-brand",
                )}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                aria-label={`Point ${index + 1} du contour`}
                data-testid="outline-point"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (event.pointerType === "mouse" && event.button !== 0) return;
                  surface.current?.setPointerCapture(event.pointerId);
                  gesture.current = {
                    index,
                    travel: 0,
                    last: { x: event.clientX, y: event.clientY },
                  };
                }}
              >
                <span className="size-4 rounded-full border-2 border-paper bg-brand shadow-raised" />
              </button>
            ))}
          </div>
        </div>
        <p className="text-ui text-ink-2" aria-live="polite">
          {points.length} point{points.length > 1 ? "s" : ""} · de 3 à {OUTLINE_MAX_POINTS}
        </p>
        {error ? (
          <p
            role="alert"
            className="text-ui font-semibold text-status-open"
            data-testid="outline-error"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter className="flex-wrap">
          <Button
            type="button"
            variant="secondary"
            disabled={points.length === 0}
            onClick={() => setPoints((list) => list.slice(0, -1))}
            data-testid="outline-undo"
          >
            <Undo2 className="size-5" aria-hidden="true" />
            Annuler le dernier point
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void save(null)}
            data-testid="outline-clear"
          >
            <Eraser className="size-5" aria-hidden="true" />
            Retirer le contour
          </Button>
          <Button
            type="button"
            loading={busy}
            onClick={() => void save(points)}
            data-testid="outline-save"
          >
            <Check className="size-5" aria-hidden="true" />
            Terminer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
