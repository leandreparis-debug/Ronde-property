"use client";

import { ImageOff } from "lucide-react";
import {
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";
import {
  centerOn,
  distance,
  fitTransform,
  isTap,
  midpoint,
  panBy,
  type Point,
  relativeToScreen,
  screenToRelative,
  type Size,
  type ViewTransform,
  ZOOM_STEP,
  zoomAt,
} from "@/lib/plans/geometry";
import type { DisplayMarker, PlanPageView } from "@/server/plans/types";

import { MARKER_HIT, MarkerPin, NotePin, ReservePin } from "./marker-pin";

/**
 * What a tap on the plan does: nothing (`view`), place or move a marker (`place`, `move`,
 * crosshair cursor), or reach `onTapPlan` with the plan screen deciding (`menu`, step 12 b).
 */
export type CanvasMode = "view" | "place" | "move" | "menu";

/** Imperative controls of the canvas, used by the toolbar. */
export interface PlanCanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Centres the view on a relative point, zooming in to at least twice the fit scale. */
  focus(point: Point): void;
  /** Current scale relative to the fit scale (1 = whole page visible). */
  zoomLevel(): number;
}

export interface PlanCanvasProps {
  page: PlanPageView;
  markers: DisplayMarker[];
  mode: CanvasMode;
  selectedId: string | null;
  showNumbers: boolean;
  /** Mouse drag of markers (desktop); never required on touch screens. */
  canDragMarkers: boolean;
  /** A tap on the plan: relative point, and its position in the canvas (CSS pixels). */
  onTapPlan: (point: Point, screen: Point) => void;
  onSelectMarker: (marker: DisplayMarker) => void;
  onDragMarker: (marker: DisplayMarker, point: Point) => void;
  onImageError: () => void;
  /** Called after every transform change (tests and the zoom label). */
  onTransform?: (transform: ViewTransform, fitScale: number) => void;
  /**
   * Transform to restore when the page is shown (zoom and position kept per view during the
   * visit, step 12 b); the page is fitted when absent.
   */
  initialTransform?: ViewTransform | null;
  /** Drawn above the image, under the markers: receives the relative → canvas projection. */
  overlay?: (project: (point: Point) => Point) => React.ReactNode;
  /** Height of the canvas (Tailwind classes); 60 % of the screen by default. */
  sizeClassName?: string;
  /** Accessible description of the canvas (what a tap does). */
  label?: string;
}

interface Gesture {
  start: number;
  travel: number;
  maxPointers: number;
  last: Point;
  pinch: { distance: number; center: Point } | null;
}

/**
 * Zoomable, pannable page of a plan, written with Pointer Events (no dependency):
 * - mouse: wheel zooms around the cursor, drag pans;
 * - touch: pinch zooms around the fingers, one-finger drag pans;
 * - only a **tap** (one pointer, short, still) reaches `onTapPlan`, so a pinch or a pan never
 *   places a marker by accident.
 * Markers live in an overlay outside the scaled layer: they keep 36 px at every zoom level,
 * their point on the exact relative position.
 */
export const PlanCanvas = forwardRef<PlanCanvasHandle, PlanCanvasProps>(function PlanCanvas(
  {
    page,
    markers,
    mode,
    selectedId,
    showNumbers,
    canDragMarkers,
    onTapPlan,
    onSelectMarker,
    onDragMarker,
    onImageError,
    onTransform,
    initialTransform,
    overlay,
    sizeClassName,
    label,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<{ id: string; point: Point; moved: boolean } | null>(null);
  const image: Size = { width: page.width, height: page.height };
  const fitScale = viewport.width > 0 ? fitTransform(image, viewport).scale : 1;

  const apply = useCallback(
    (next: ViewTransform) => {
      transformRef.current = next;
      setTransform(next);
      onTransform?.(next, fitScale);
    },
    [fitScale, onTransform],
  );

  // Track the viewport size.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Fit the page when it changes or when the viewport is first known.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (viewport.width === 0) return;
    const key = `${page.imageUrl ?? page.pageNumber}:${page.pageNumber}:${page.width}x${page.height}`;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    apply(initialTransform ?? fitTransform(image, viewport));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit once per page
  }, [viewport, page.pageNumber, page.width, page.height]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () =>
        apply(
          zoomAt(
            transformRef.current,
            ZOOM_STEP,
            { x: viewport.width / 2, y: viewport.height / 2 },
            fitScale,
          ),
        ),
      zoomOut: () =>
        apply(
          zoomAt(
            transformRef.current,
            1 / ZOOM_STEP,
            { x: viewport.width / 2, y: viewport.height / 2 },
            fitScale,
          ),
        ),
      fit: () => apply(fitTransform(image, viewport)),
      focus: (point) => apply(centerOn(point, transformRef.current, image, viewport, fitScale * 2)),
      zoomLevel: () => transformRef.current.scale / fitScale,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- image derives from page
    [apply, fitScale, viewport, page.width, page.height],
  );

  // Wheel zoom needs a non-passive listener to prevent the page scroll.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      apply(
        zoomAt(
          transformRef.current,
          factor,
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          fitScale,
        ),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [apply, fitScale]);

  function local(event: { clientX: number; clientY: number }): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    containerRef.current?.setPointerCapture(event.pointerId);
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const all = [...pointers.current.values()];
    if (!gesture.current) {
      gesture.current = {
        start: performance.now(),
        travel: 0,
        maxPointers: 1,
        last: point,
        pinch: null,
      };
    }
    gesture.current.maxPointers = Math.max(gesture.current.maxPointers, all.length);
    if (all.length === 2) {
      gesture.current.pinch = {
        distance: distance(all[0]!, all[1]!),
        center: midpoint(all[0]!, all[1]!),
      };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    const point = local(event);
    const previous = pointers.current.get(event.pointerId)!;
    pointers.current.set(event.pointerId, point);
    const all = [...pointers.current.values()];
    const g = gesture.current;
    if (all.length >= 2 && g.pinch) {
      const nextDistance = distance(all[0]!, all[1]!);
      const nextCenter = midpoint(all[0]!, all[1]!);
      let next = zoomAt(
        transformRef.current,
        nextDistance / g.pinch.distance,
        g.pinch.center,
        fitScale,
      );
      next = panBy(next, nextCenter.x - g.pinch.center.x, nextCenter.y - g.pinch.center.y);
      g.pinch = { distance: nextDistance, center: nextCenter };
      g.travel += 100;
      apply(next);
      return;
    }
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    g.travel += Math.hypot(dx, dy);
    if (g.travel > 6) apply(panBy(transformRef.current, dx, dy));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const point = local(event);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) {
      // A finger lifted during a pinch: keep panning with the other one, never tap.
      if (g) g.pinch = null;
      return;
    }
    gesture.current = null;
    if (!g || event.type === "pointercancel") return;
    const tap = isTap({
      pointers: g.maxPointers,
      travel: g.travel,
      durationMs: performance.now() - g.start,
    });
    if (!tap || mode === "view") return;
    const relative = screenToRelative(point, transformRef.current, image);
    if (relative) onTapPlan(relative, point);
  }

  // Mouse drag of a marker (desktop only): pointer events on the marker button itself.
  function markerPointerDown(event: ReactPointerEvent<HTMLButtonElement>, marker: DisplayMarker) {
    event.stopPropagation();
    if (!canDragMarkers || event.pointerType !== "mouse" || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: marker.id, point: { x: marker.x, y: marker.y }, moved: false });
  }

  function markerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const relative = screenToRelative(local(event), transformRef.current, image);
    if (!relative) return;
    const screen = relativeToScreen(drag.point, transformRef.current, image);
    const moved = drag.moved || distance(screen, local(event)) > 6;
    setDrag({ ...drag, point: relative, moved });
  }

  function markerPointerUp(marker: DisplayMarker) {
    if (drag && drag.id === marker.id && drag.moved) onDragMarker(marker, drag.point);
    setDrag(null);
  }

  const imageStyle = {
    width: page.width,
    height: page.height,
    transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
    transformOrigin: "0 0",
  } as const;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full touch-none overflow-hidden rounded-lg border border-rule bg-craie select-none",
        sizeClassName ?? "h-[60dvh] min-h-[360px] lg:h-[70dvh]",
        mode === "view" || mode === "menu" ? "cursor-grab" : "cursor-crosshair",
      )}
      data-testid="plan-canvas"
      data-scale={transform.scale}
      data-fit-scale={fitScale}
      data-mode={mode}
      role={label ? "application" : undefined}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {page.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, scaled by CSS
        <img
          src={page.imageUrl}
          alt={`Page ${page.pageNumber} du plan`}
          width={page.width}
          height={page.height}
          draggable={false}
          className="pointer-events-none absolute top-0 left-0 max-w-none bg-paper"
          style={imageStyle}
          onError={onImageError}
          data-testid="plan-page-image"
        />
      ) : (
        <p className="absolute inset-0 flex items-center justify-center gap-2 text-ui text-ink-2">
          <ImageOff className="size-5" aria-hidden="true" />
          Page indisponible
        </p>
      )}
      {overlay ? overlay((p) => relativeToScreen(p, transform, image)) : null}
      <ul className="pointer-events-none absolute inset-0" aria-label="Repères de la page">
        {markers.map((marker) => {
          const position =
            drag && drag.id === marker.id ? drag.point : { x: marker.x, y: marker.y };
          const screen = relativeToScreen(position, transform, image);
          const markerLabel = marker.reserve
            ? `Réserve ${marker.reserve.code} : ${marker.reserve.action}`
            : marker.kind === "note"
              ? `Note : ${marker.label ?? ""}`
              : `Repère n° ${marker.number ?? "• (en attente de numéro)"}${marker.label ? ` : ${marker.label}` : ""}${marker.photoId ? "" : " (sans photo)"}`;
          return (
            <li
              key={marker.id}
              className="absolute"
              style={{
                left: screen.x - MARKER_HIT / 2,
                top: screen.y - MARKER_HIT,
                width: MARKER_HIT,
                height: MARKER_HIT,
              }}
            >
              <button
                type="button"
                className={cn(
                  "pointer-events-auto flex size-11 items-end justify-center rounded-md",
                  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  canDragMarkers && "cursor-move",
                )}
                aria-label={markerLabel}
                aria-pressed={selectedId === marker.id}
                data-testid="plan-marker"
                data-number={marker.number ?? undefined}
                data-has-photo={marker.photoId ? "true" : "false"}
                data-reserve={marker.reserve?.code}
                data-kind={marker.reserve ? "reserve" : marker.kind}
                data-x={marker.x}
                data-y={marker.y}
                onPointerDown={(event) => markerPointerDown(event, marker)}
                onPointerMove={markerPointerMove}
                onPointerUp={() => markerPointerUp(marker)}
                onClick={() => {
                  if (!drag?.moved) onSelectMarker(marker);
                }}
              >
                {marker.kind === "note" && !marker.reserve ? (
                  <NotePin selected={selectedId === marker.id} />
                ) : marker.reserve ? (
                  <ReservePin
                    reserve={marker.reserve}
                    selected={selectedId === marker.id}
                    showCode={showNumbers}
                  />
                ) : (
                  <MarkerPin
                    number={marker.number}
                    hasPhoto={Boolean(marker.photoId)}
                    selected={selectedId === marker.id}
                    showNumber={showNumbers}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
