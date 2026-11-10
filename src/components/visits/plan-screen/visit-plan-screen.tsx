"use client";

import { Camera, Inbox, ListChecks, Maximize, Minus, Plus, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useVisit } from "@/components/offline/visit-data";
import { useVisitMutations } from "@/components/offline/visit-mutations";
import { MarkerPin, NotePin, ReservePin } from "@/components/plans/marker-pin";
import { MarkerSheet } from "@/components/plans/marker-sheet";
import { type CanvasMode, PlanCanvas, type PlanCanvasHandle } from "@/components/plans/plan-canvas";
import { ReserveSheet, type ReserveSheetTarget } from "@/components/reserves/reserve-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useUploadQueue } from "@/components/visits/photos/upload-queue-provider";
import { cn } from "@/lib/cn";
import { uuidv7 } from "@/lib/offline/ids";
import { replaceQuery } from "@/lib/offline/query";
import type { Point, ViewTransform } from "@/lib/plans/geometry";
import { buildingAt, resolveZone, viewShortTitle, viewTitle } from "@/lib/plans/structure";
import {
  countsByBuilding,
  countsByView,
  createViewMemory,
  entryLevel,
  type FeedEntry,
  initialLocation,
  levelsOf,
  locationParam,
  type PlanLocation,
  screenBuildings,
  type ScreenView,
  screenViews,
  thumbSide,
  viewIdOfMarker,
  visitFeed,
} from "@/lib/plans/visit-plan";
import { PLACE_RESERVE_PARAM, reserveHref } from "@/lib/reserves/links";
import type { PhotoView } from "@/server/photos/types";
import type { DisplayMarker, PlanPageView } from "@/server/plans/types";

import { ExteriorOverlay } from "./exterior-overlay";
import { NoteSheet } from "./note-sheet";
import { PhotoSheet } from "./photo-sheet";
import {
  BuildingCards,
  type Crumb,
  CountBadge,
  LevelCards,
  LevelTabs,
  PlanBreadcrumb,
} from "./plan-navigation";
import { QuickMenu, type QuickChoice } from "./quick-menu";
import { ReserveMarkerSheet } from "./reserve-marker-sheet";
import { ToSortDrawer } from "./to-sort-drawer";
import { useHandedness } from "./use-handedness";
import { VisitFeedBar } from "./visit-feed-bar";

/** How long « Annuler » stays offered after an entry (ms). */
const UNDO_MS = 10_000;

/** A point of a view where something is added. */
interface Place {
  viewId: string;
  planId: string;
  page: number;
  x: number;
  y: number;
}

type Sheet =
  | { kind: "photo"; photoId: string; markerId: string; viewId: string }
  | { kind: "note-new"; place: Place }
  | { kind: "marker"; markerId: string }
  | { kind: "to-sort" };

type Placing =
  | { kind: "photo"; photo: PhotoView }
  | { kind: "reserve"; reserveId: string }
  | { kind: "move"; markerId: string };

interface ReserveDraft {
  target: ReserveSheetTarget;
  /** Marker created with the reserve (« Réserve » of the quick menu). */
  place?: Place;
  /** Existing marker that becomes the reserve's (« En faire une réserve » of a photo). */
  attachMarkerId?: string;
  /** Photo of « À ranger » turned into a reserve: it leaves the drawer. */
  sortedPhotoId?: string;
}

function sessionStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function useSessionRecord(key: string) {
  const [record, setRecord] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setRecord(JSON.parse(sessionStore()?.getItem(key) ?? "{}") as Record<string, string>);
    } catch {
      setRecord({});
    }
  }, [key]);
  const set = useCallback(
    (id: string, value: string | null) => {
      setRecord((current) => {
        const next = { ...current };
        if (value === null) delete next[id];
        else next[id] = value;
        try {
          sessionStore()?.setItem(key, JSON.stringify(next));
        } catch {
          // Storage blocked: the memory lasts as long as the page.
        }
        return next;
      });
    },
    [key],
  );
  return [record, set] as const;
}

/**
 * « Plan », main screen of a visit (step 12 b): the visit is led from the plan of the site.
 * - Navigation between the exterior view (outlines of the buildings, touchable), the list of
 *   the buildings and the levels of a building (tabs with their count), with a breadcrumb and
 *   `?vue=` in the URL; the zoom of each view is remembered during the visit.
 * - A short tap on a usable view opens the quick menu at the point (Photo, Réserve, Note);
 *   a pan or a pinch never does. The shutter (thumb side) adds a photo to « À ranger ».
 * - Existing markers open their sheet (« Déplacer », mouse drag); the visit feed lists the
 *   latest entries, « Annuler » undoes the last one for 10 seconds.
 * Every write goes through the outbox (`useVisitMutations`, upload queue): all of it works
 * offline. Read-only (visit not editable): the same navigation and sheets without controls.
 */
export function VisitPlanScreen({
  visitId,
  canEdit,
  canConfigure,
  zones,
}: {
  visitId: string;
  canEdit: boolean;
  /** RT or admin: « Importer un plan » when the site has none. */
  canConfigure: boolean;
  zones: Array<{ key: string; label: string }>;
}) {
  const data = useVisit();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const mutations = useVisitMutations(visitId);
  const { enqueue } = useUploadQueue();
  const [leftHanded] = useHandedness();
  const side = thumbSide(leftHanded);

  const archivedPlanIds = useMemo(
    () => new Set(data.plans.filter((p) => p.isArchived).map((p) => p.id)),
    [data.plans],
  );
  const shown = useMemo(
    () =>
      screenViews({
        views: data.views,
        buildings: data.buildings,
        pages: data.planPages,
        archivedPlanIds,
        markers: data.markers,
      }),
    [data.views, data.buildings, data.planPages, archivedPlanIds, data.markers],
  );
  const buildings = useMemo(() => screenBuildings(data.buildings, shown), [data.buildings, shown]);
  const viewCounts = useMemo(
    () => countsByView(data.markers, data.views),
    [data.markers, data.views],
  );
  const buildingCounts = useMemo(
    () => countsByBuilding(viewCounts, data.views),
    [viewCounts, data.views],
  );
  const exterior = shown.find((v) => v.view.kind === "exterior") ?? null;

  // Where the screen is. The legacy links (`?plan=…&page=…&repere=…`) open the view of that page.
  const legacyView = useMemo(() => {
    const planId = searchParams.get("plan");
    if (!planId) return null;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    return viewIdOfMarker({ id: "", planId, page }, data.views);
  }, [searchParams, data.views]);
  const [location, setLocation] = useState<PlanLocation>(() =>
    initialLocation(legacyView ?? searchParams.get("vue"), shown, buildings),
  );
  const current: ScreenView | null =
    location.kind === "view" ? (shown.find((v) => v.view.id === location.viewId) ?? null) : null;

  // The views arrive with the local copy: open the default place once they are known.
  useEffect(() => {
    if (location.kind === "view" && !current && shown.length > 0) {
      setLocation(initialLocation(legacyView ?? searchParams.get("vue"), shown, buildings));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the views change
  }, [shown.length]);

  const [lastLevel, setLastLevel] = useSessionRecord(`ronde.plan.${visitId}.levels`);
  const [lastZone, setLastZone] = useSessionRecord(`ronde.plan.${visitId}.zones`);
  const memory = useMemo(
    () => createViewMemory(sessionStore(), `ronde.plan.${visitId}.zoom`),
    [visitId],
  );

  const canvasRef = useRef<PlanCanvasHandle>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const menuCamera = useRef<HTMLInputElement>(null);
  const shutterCamera = useRef<HTMLInputElement>(null);
  const pendingPhoto = useRef<Place | null>(null);
  const [menu, setMenu] = useState<{ place: Place; screen: Point } | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [reserveDraft, setReserveDraft] = useState<ReserveDraft | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [undo, setUndo] = useState<{
    label: string;
    run: () => Promise<void>;
    until: number;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ markerId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const showDone = searchParams.get("levees") === "afficher";
  const toSort = useMemo(() => data.photos.filter((photo) => photo.toSort), [data.photos]);

  const go = useCallback((next: PlanLocation, options: { keepSheet?: boolean } = {}) => {
    setLocation(next);
    setMenu(null);
    if (!options.keepSheet) setSheet((s) => (s?.kind === "to-sort" ? s : null));
    const params = new URLSearchParams(window.location.search);
    params.set("vue", locationParam(next));
    for (const key of ["plan", "page", "repere"]) params.delete(key);
    replaceQuery(params);
  }, []);

  const enterBuilding = useCallback(
    (buildingId: string) => {
      const level = entryLevel(buildingId, shown, lastLevel);
      if (level) go({ kind: "view", viewId: level.view.id });
      else go({ kind: "building", buildingId });
    },
    [go, shown, lastLevel],
  );

  // Remember the level looked at in each building.
  useEffect(() => {
    if (current?.view.buildingId) setLastLevel(current.view.buildingId, current.view.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on view change
  }, [current?.view.id]);

  // Preload the images of the neighbour views (levels of the building, exterior view).
  useEffect(() => {
    if (!current) return;
    const neighbours = current.view.buildingId ? levelsOf(current.view.buildingId, shown) : [];
    const index = neighbours.findIndex((v) => v.view.id === current.view.id);
    const urls = [neighbours[index - 1], neighbours[index + 1], exterior]
      .map((v) => v?.page.imageUrl)
      .filter((url): url is string => Boolean(url) && url !== current.page.imageUrl);
    for (const url of urls) {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
    }
  }, [current, shown, exterior]);

  // Undo is offered for 10 seconds.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);

  // `?placer=<reserve>` (reserve detail): the next tap on the plan places the reserve.
  const placeParam = searchParams.get(PLACE_RESERVE_PARAM);
  useEffect(() => {
    if (placeParam && canEdit && data.reserves.some((r) => r.id === placeParam)) {
      setPlacing({ kind: "reserve", reserveId: placeParam });
      setSheet(null);
    }
  }, [placeParam, canEdit, data.reserves]);

  // `?repere=` (legacy links, photo viewer, reserve detail): centre and open that marker.
  const repereParam = searchParams.get("repere");
  useEffect(() => {
    if (!repereParam) return;
    const marker = data.markers.find((m) => m.id === repereParam);
    if (!marker) return;
    const viewId = viewIdOfMarker(marker, data.views);
    if (viewId && (location.kind !== "view" || location.viewId !== viewId)) {
      setLocation({ kind: "view", viewId });
    }
    setFocusRequest({ markerId: marker.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per requested marker
  }, [repereParam, data.markers.length]);

  const viewMarkers = useMemo(() => {
    if (!current) return [];
    return data.markers
      .filter((m) => m.planId === current.view.planId && m.page === current.view.pageNumber)
      .filter((m) => showDone || m.reserve?.status !== "done");
  }, [current, data.markers, showDone]);

  useEffect(() => {
    if (!focusRequest || !current) return;
    const marker = viewMarkers.find((m) => m.id === focusRequest.markerId);
    if (!marker) return;
    const timer = setTimeout(() => {
      canvasRef.current?.focus({ x: marker.x, y: marker.y });
      setSheet({ kind: "marker", markerId: marker.id });
      setFocusRequest(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [focusRequest, current, viewMarkers]);

  const titleOf = useCallback(
    (viewId: string | null) => {
      const view = data.views.find((v) => v.id === viewId);
      return view ? viewShortTitle(view, data.buildings) : null;
    },
    [data.views, data.buildings],
  );
  const zoneOf = useCallback(
    (place: Place) => resolveZone(place.viewId, place.x, place.y) ?? lastZone[place.viewId] ?? null,
    [lastZone],
  );
  const currentZone = current ? (lastZone[current.view.id] ?? "") : "";

  const feed = useMemo(
    () =>
      visitFeed({
        markers: data.markers.map((m) => ({
          id: m.id,
          planId: m.planId,
          page: m.page,
          kind: m.kind,
          label: m.label,
          number: m.number,
          createdAt: m.createdAt,
          reserve: m.reserve
            ? { id: m.reserve.id, code: m.reserve.code, action: m.reserve.action }
            : null,
        })),
        photos: data.photos.map((p) => ({
          id: p.id,
          caption: p.caption,
          toSort: p.toSort,
          createdAt: p.createdAt,
        })),
        reserves: data.reserves.map((r) => ({
          id: r.id,
          code: r.code,
          action: r.action,
          createdAt: r.createdAt,
          marker: r.marker ? { id: r.marker.id } : null,
        })),
        views: data.views,
        buildings: data.buildings,
      }),
    [data.markers, data.photos, data.reserves, data.views, data.buildings],
  );

  function offerUndo(label: string, run: () => Promise<void>) {
    setUndo({ label, run, until: Date.now() + UNDO_MS });
  }

  function report(result: { ok: true } | { ok: false; error: string }) {
    if (!result.ok) setError(result.error);
  }

  // ---------------------------------------------------------------- taps on the plan

  async function tapPlan(point: Point, screen: Point) {
    if (!current) return;
    setError(null);
    if (menu) {
      setMenu(null);
      return;
    }
    const place: Place = {
      viewId: current.view.id,
      planId: current.view.planId,
      page: current.view.pageNumber,
      x: point.x,
      y: point.y,
    };
    if (placing) {
      await placeAt(placing, place);
      return;
    }
    if (current.view.kind === "exterior") {
      const building = buildingAt(point, buildings);
      if (building) {
        enterBuilding(building.id);
        return;
      }
    }
    if (!canEdit || !current.usable) return;
    setSheet((s) => (s?.kind === "to-sort" ? s : null));
    setMenu({ place, screen });
  }

  async function placeAt(what: Placing, place: Place) {
    setPlacing(null);
    if (what.kind === "move") {
      const marker = data.markers.find((m) => m.id === what.markerId);
      if (!marker) return;
      if (marker.planId !== place.planId || marker.page !== place.page) {
        setError("Un repère se déplace sur la même vue. Revenez sur sa vue pour le déplacer.");
        return;
      }
      report(await mutations.moveMarker(marker.id, place.x, place.y, marker.number));
      return;
    }
    if (what.kind === "photo") {
      const markerId = uuidv7();
      const created = mutations.createMarker({
        id: markerId,
        planId: place.planId,
        page: place.page,
        x: place.x,
        y: place.y,
        photoId: what.photo.id,
        kind: "photo",
      });
      const sorted = mutations.updatePhoto(what.photo.id, { toSort: false }, what.photo.caption);
      setSheet({ kind: "marker", markerId });
      const [a, b] = await Promise.all([created, sorted]);
      report(a);
      report(b);
      toast({ variant: "success", title: "Photo placée sur le plan" });
      return;
    }
    const reserve = data.reserves.find((r) => r.id === what.reserveId);
    const params = new URLSearchParams(window.location.search);
    params.delete(PLACE_RESERVE_PARAM);
    replaceQuery(params);
    if (!reserve) return;
    const result = await mutations.placeReserve(reserve, place);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({
      variant: "success",
      title: result.queued
        ? `${reserve.code} placée sur le plan (en attente de synchronisation)`
        : `${reserve.code} placée sur le plan`,
    });
    router.push(reserveHref(visitId, reserve.id));
  }

  function choose(choice: QuickChoice) {
    if (!menu) return;
    const place = menu.place;
    setMenu(null);
    if (choice === "photo") {
      pendingPhoto.current = place;
      menuCamera.current?.click();
      return;
    }
    if (choice === "note") {
      setSheet({ kind: "note-new", place });
      return;
    }
    setReserveDraft({ target: { kind: "create", zoneKey: zoneOf(place) }, place });
  }

  // « Photo » of the quick menu: once the photo is stored on the device, its marker is created
  // at the point and the light sheet opens. A cancelled camera creates nothing.
  function photoTaken(files: File[]) {
    const place = pendingPhoto.current;
    pendingPhoto.current = null;
    if (!place || files.length === 0) return;
    const zoneKey = zoneOf(place);
    enqueue(files.slice(0, 1), {
      zoneKey,
      onStored: (photo) => {
        const markerId = uuidv7();
        void mutations
          .createMarker({
            id: markerId,
            planId: place.planId,
            page: place.page,
            x: place.x,
            y: place.y,
            photoId: photo.id,
            kind: "photo",
          })
          .then(report);
        setSheet({ kind: "photo", photoId: photo.id, markerId, viewId: place.viewId });
        offerUndo("photo placée", async () => {
          await mutations.deleteMarker(markerId, null);
          await mutations.deletePhoto(photo.id, null);
        });
      },
    });
  }

  function shutterTaken(files: File[]) {
    if (files.length === 0) return;
    enqueue(files, {
      zoneKey: current ? (lastZone[current.view.id] ?? null) : null,
      toSort: true,
      hintViewId: current?.view.id ?? null,
      onStored: (photo) => {
        toast({ variant: "success", title: "Photo ajoutée à « À ranger »" });
        offerUndo("photo à ranger", async () => {
          await mutations.deletePhoto(photo.id, null);
        });
      },
    });
  }

  async function saveNote(place: Place, text: string): Promise<string | null> {
    const markerId = uuidv7();
    const result = await mutations.createMarker({
      id: markerId,
      planId: place.planId,
      page: place.page,
      x: place.x,
      y: place.y,
      kind: "note",
      label: text,
    });
    if (!result.ok) return result.error;
    setSheet(null);
    offerUndo("note", async () => {
      await mutations.deleteMarker(markerId, null);
    });
    return null;
  }

  async function reserveSaved(
    saved: { id: string; code: string; action: string; queued: boolean },
    draft: ReserveDraft,
  ) {
    setReserveDraft(null);
    toast({
      variant: "success",
      title: saved.queued
        ? `${saved.code} enregistrée sur la tablette`
        : `${saved.code} enregistrée`,
      description: saved.queued ? "Elle partira au retour du réseau." : undefined,
    });
    if (draft.place) {
      report(await mutations.placeReserve({ ...saved, marker: null }, draft.place));
    } else if (draft.attachMarkerId) {
      report(
        await mutations.attachMarker(saved.id, draft.attachMarkerId, saved.code, saved.action),
      );
    }
    if (draft.sortedPhotoId) {
      const photo = data.photos.find((p) => p.id === draft.sortedPhotoId);
      report(
        await mutations.updatePhoto(draft.sortedPhotoId, { toSort: false }, photo?.caption ?? null),
      );
    }
    if (draft.target.kind === "create") {
      offerUndo(saved.code, async () => {
        await mutations.deleteReserve(saved.id, saved.code, saved.action);
      });
    }
  }

  function openEntry(entry: FeedEntry) {
    if (entry.kind === "to-sort") {
      setSheet({ kind: "to-sort" });
      return;
    }
    if (!entry.markerId || !entry.viewId) return;
    if (location.kind !== "view" || location.viewId !== entry.viewId) {
      go({ kind: "view", viewId: entry.viewId });
    }
    setFocusRequest({ markerId: entry.markerId });
  }

  // ---------------------------------------------------------------- empty states

  if (shown.length === 0) {
    return (
      <div
        className="flex flex-col gap-4"
        data-testid="plan-screen"
        data-ready={ready ? "true" : undefined}
      >
        <EmptyState
          mood="asleep"
          title={data.plans.length === 0 ? "Aucun plan pour ce site" : "Aucune vue configurée"}
          description={
            canConfigure
              ? data.plans.length === 0
                ? "Importez le plan du site (PDF, PNG ou JPEG) puis affectez ses pages : vue extérieure, bâtiments et étages."
                : "Affectez les pages des plans du site à la vue extérieure ou aux étages de ses bâtiments."
              : "Le plan du site n'est pas encore configuré : la visite se mène depuis « Liste »."
          }
        />
        {canConfigure ? (
          <Button asChild size="lg" className="self-center">
            <Link
              href={`/sites/${data.visit.site.code}#batiments`}
              data-testid="plan-screen-configure"
            >
              <Settings2 className="size-5" aria-hidden="true" />
              {data.plans.length === 0 ? "Importer un plan" : "Affecter les pages"}
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  // ---------------------------------------------------------------- breadcrumb

  const crumbs: Crumb[] = [];
  const multiple = shown.length > 1;
  if (multiple) {
    if (exterior)
      crumbs.push({
        label: "Vue extérieure",
        location: { kind: "view", viewId: exterior.view.id },
      });
    if (location.kind === "buildings" || !exterior) {
      crumbs.push({ label: "Bâtiments", location: { kind: "buildings" } });
    }
    const buildingId =
      location.kind === "building" ? location.buildingId : (current?.view.buildingId ?? null);
    const building = buildingId ? data.buildings.find((b) => b.id === buildingId) : null;
    if (building)
      crumbs.push({
        label: building.name,
        location: { kind: "building", buildingId: building.id },
      });
    if (current && current.view.kind === "level")
      crumbs.push({ label: current.view.label, location: null });
    if (location.kind === "buildings" && exterior) crumbs[crumbs.length - 1]!.location = null;
  }

  // ---------------------------------------------------------------- sheets

  const selectedMarker =
    sheet?.kind === "marker" ? (data.markers.find((m) => m.id === sheet.markerId) ?? null) : null;
  const markerWhere = (marker: DisplayMarker) => {
    const viewId = viewIdOfMarker(marker, data.views);
    const view = data.views.find((v) => v.id === viewId);
    return view ? viewTitle(view, data.buildings) : "Plan";
  };
  const moving = placing?.kind === "move" ? placing.markerId : null;
  const placingReserve =
    placing?.kind === "reserve"
      ? (data.reserves.find((r) => r.id === placing.reserveId) ?? null)
      : null;

  let sheetNode: React.ReactNode = null;
  if (sheet?.kind === "photo") {
    const photo = data.photos.find((p) => p.id === sheet.photoId) ?? null;
    sheetNode = (
      <PhotoSheet
        key={sheet.photoId}
        photo={photo}
        where={titleOf(sheet.viewId) ?? ""}
        zones={zones}
        initialZone={photo?.zoneKey ?? lastZone[sheet.viewId] ?? null}
        onSave={(patch) => {
          if (patch.zoneKey) setLastZone(sheet.viewId, patch.zoneKey);
          void mutations.updatePhoto(sheet.photoId, patch, patch.caption).then(report);
        }}
        onMakeReserve={() =>
          setReserveDraft({
            target: {
              kind: "create",
              zoneKey: photo?.zoneKey ?? lastZone[sheet.viewId] ?? null,
              photoIds: [sheet.photoId],
            },
            attachMarkerId: sheet.markerId,
          })
        }
        onClose={() => setSheet(null)}
      />
    );
  } else if (sheet?.kind === "note-new") {
    const place = sheet.place;
    sheetNode = (
      <NoteSheet
        key={`new-${place.x}-${place.y}`}
        initial={null}
        where={titleOf(place.viewId) ?? ""}
        canEdit={canEdit}
        onSave={(text) => saveNote(place, text)}
        onClose={() => setSheet(null)}
      />
    );
  } else if (selectedMarker && selectedMarker.kind === "note" && !selectedMarker.reserve) {
    sheetNode = (
      <NoteSheet
        key={selectedMarker.id}
        initial={selectedMarker.label ?? ""}
        where={markerWhere(selectedMarker)}
        canEdit={canEdit}
        moving={moving === selectedMarker.id}
        onSave={async (text) => {
          const result = await mutations.updateMarker(selectedMarker.id, { label: text }, null);
          if (!result.ok) return result.error;
          setSheet(null);
          return null;
        }}
        onStartMove={() =>
          setPlacing((p) =>
            p?.kind === "move" ? null : { kind: "move", markerId: selectedMarker.id },
          )
        }
        onDelete={async () => {
          const result = await mutations.deleteMarker(selectedMarker.id, null);
          if (!result.ok) return result.error;
          setSheet(null);
          toast({ variant: "success", title: "Note supprimée" });
          return null;
        }}
        onClose={() => {
          setSheet(null);
          setPlacing(null);
        }}
      />
    );
  } else if (selectedMarker?.reserve) {
    const reserve = data.reserves.find((r) => r.id === selectedMarker.reserve!.id);
    sheetNode = (
      <ReserveMarkerSheet
        key={selectedMarker.id}
        visitId={visitId}
        reserve={selectedMarker.reserve}
        where={markerWhere(selectedMarker)}
        canEdit={canEdit && Boolean(reserve)}
        moving={moving === selectedMarker.id}
        onEdit={() => reserve && setReserveDraft({ target: { kind: "edit", reserve } })}
        onStartMove={() =>
          setPlacing((p) =>
            p?.kind === "move" ? null : { kind: "move", markerId: selectedMarker.id },
          )
        }
        onClose={() => {
          setSheet(null);
          setPlacing(null);
        }}
      />
    );
  } else if (selectedMarker) {
    const plan = data.plans.find((p) => p.id === selectedMarker.planId);
    sheetNode = (
      <div className="lg:w-96 lg:shrink-0">
        <MarkerSheet
          key={selectedMarker.id}
          marker={selectedMarker}
          planName={plan?.name ?? "Plan"}
          where={markerWhere(selectedMarker)}
          photos={data.photos}
          zones={zones}
          canEdit={canEdit}
          moving={moving === selectedMarker.id}
          onCreateReserve={() => {
            const photo = data.photos.find((p) => p.id === selectedMarker.photoId);
            setReserveDraft({
              target: {
                kind: "create",
                zoneKey: photo?.zoneKey ?? null,
                photoIds: selectedMarker.photoId ? [selectedMarker.photoId] : [],
              },
              attachMarkerId: selectedMarker.id,
            });
          }}
          onClose={() => {
            setSheet(null);
            setPlacing(null);
          }}
          onStartMove={() =>
            setPlacing((p) =>
              p?.kind === "move" ? null : { kind: "move", markerId: selectedMarker.id },
            )
          }
          onUpdate={async (patch) => {
            const result = await mutations.updateMarker(
              selectedMarker.id,
              patch,
              selectedMarker.number,
            );
            return result.ok ? null : result.error;
          }}
          onDelete={async () => {
            const number = selectedMarker.number;
            const result = await mutations.deleteMarker(selectedMarker.id, number);
            if (!result.ok) return result.error;
            setSheet(null);
            toast({
              variant: "success",
              title: number ? `Repère n° ${number} supprimé` : "Repère supprimé",
            });
            return null;
          }}
        />
      </div>
    );
  } else if (sheet?.kind === "to-sort") {
    sheetNode = (
      <ToSortDrawer
        photos={toSort}
        viewTitle={titleOf}
        canEdit={canEdit}
        onPlace={(photo) => {
          setPlacing({ kind: "photo", photo });
          setSheet(null);
          const hinted =
            photo.hintViewId && shown.find((v) => v.view.id === photo.hintViewId && v.usable);
          if (hinted && (location.kind !== "view" || location.viewId !== hinted.view.id)) {
            go({ kind: "view", viewId: hinted.view.id }, { keepSheet: true });
          }
        }}
        onKeepUnplaced={(photo) =>
          void mutations.updatePhoto(photo.id, { toSort: false }, photo.caption).then(report)
        }
        onMakeReserve={(photo) =>
          setReserveDraft({
            target: { kind: "create", zoneKey: photo.zoneKey, photoIds: [photo.id] },
            sortedPhotoId: photo.id,
          })
        }
        onClose={() => setSheet(null)}
      />
    );
  }

  // ---------------------------------------------------------------- canvas

  const canvasPage: PlanPageView | null = current
    ? (data.planPages[current.view.planId]?.find((p) => p.pageNumber === current.view.pageNumber) ??
      null)
    : null;
  const mode: CanvasMode = placing ? (placing.kind === "move" ? "move" : "place") : "menu";
  const canvasLabel = canEdit
    ? "Plan de la visite : touchez un point pour ajouter une photo, une réserve ou une note."
    : "Plan de la visite, en lecture seule.";
  const otherSideClass = side === "left" ? "right-3" : "left-3";

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="plan-screen"
      data-ready={ready ? "true" : undefined}
      data-thumb-side={side}
      data-location={locationParam(location)}
    >
      <PlanBreadcrumb
        crumbs={crumbs}
        onGo={(next) => (next.kind === "building" ? go(next) : go(next))}
        trailing={
          exterior && buildings.length > 0 && location.kind !== "buildings" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => go({ kind: "buildings" })}
              data-testid="plan-all-buildings"
            >
              Tous les bâtiments
            </Button>
          ) : null
        }
      />

      {current && current.view.buildingId ? (
        <LevelTabs
          levels={levelsOf(current.view.buildingId, shown)}
          currentId={current.view.id}
          counts={viewCounts}
          onSelect={(viewId) => go({ kind: "view", viewId })}
        />
      ) : null}

      {placing ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-brand-soft px-3 py-1"
          role="status"
          data-testid="placing-hint"
        >
          <p className="text-ui font-semibold text-brand-deep">
            {placing.kind === "photo"
              ? "Touchez le plan pour placer la photo"
              : placing.kind === "reserve"
                ? `Touchez le plan pour placer ${placingReserve?.code ?? "la réserve"}`
                : "Touchez le plan pour déplacer le repère"}
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPlacing(null);
              if (placing.kind === "reserve") {
                const params = new URLSearchParams(window.location.search);
                params.delete(PLACE_RESERVE_PARAM);
                replaceQuery(params);
              }
            }}
          >
            Annuler
          </Button>
        </div>
      ) : current && !current.usable ? (
        <p
          className="rounded-md bg-galet px-3 py-1 text-ui text-ink-2"
          role="status"
          data-testid="view-badge"
        >
          {current.badge === "Ancienne image"
            ? "Ancienne image de cet étage : les repères de la visite y restent, les nouveaux vont sur la nouvelle image."
            : "Vue archivée : les repères existants restent visibles, aucun nouveau repère."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-ui font-medium text-status-open">
          {error}
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {location.kind === "buildings" ? (
            <BuildingCards
              buildings={buildings}
              views={shown}
              buildingCounts={buildingCounts}
              viewCounts={viewCounts}
              onOpenBuilding={enterBuilding}
            />
          ) : location.kind === "building" ? (
            <LevelCards
              levels={levelsOf(location.buildingId, shown)}
              counts={viewCounts}
              onOpen={(viewId) => go({ kind: "view", viewId })}
            />
          ) : current && canvasPage ? (
            <div ref={canvasBox} className="relative">
              <PlanCanvas
                key={current.view.id}
                ref={canvasRef}
                page={canvasPage}
                markers={viewMarkers}
                mode={mode}
                selectedId={sheet?.kind === "marker" ? sheet.markerId : null}
                showNumbers
                canDragMarkers={canEdit}
                initialTransform={memory.get(current.view.id)}
                sizeClassName="h-[calc(100dvh-15rem)] min-h-[320px] lg:h-[calc(100dvh-12rem)]"
                label={canvasLabel}
                onTapPlan={(point, screen) => void tapPlan(point, screen)}
                onSelectMarker={(marker) => {
                  setMenu(null);
                  if (placing?.kind === "move") setPlacing(null);
                  setSheet({ kind: "marker", markerId: marker.id });
                }}
                onDragMarker={(marker, point) =>
                  void mutations.moveMarker(marker.id, point.x, point.y, marker.number).then(report)
                }
                onImageError={() => undefined}
                onTransform={(transform: ViewTransform) => {
                  memory.set(current.view.id, transform);
                  setMenu((m) => (m ? null : m));
                }}
                overlay={
                  current.view.kind === "exterior"
                    ? (project) => (
                        <ExteriorOverlay
                          buildings={buildings}
                          counts={buildingCounts}
                          project={project}
                          onOpen={enterBuilding}
                        />
                      )
                    : undefined
                }
              />
              {menu ? (
                <QuickMenu
                  screen={menu.screen}
                  canvas={{
                    width: canvasBox.current?.clientWidth ?? 600,
                    height: canvasBox.current?.clientHeight ?? 400,
                  }}
                  onChoose={choose}
                  onClose={() => setMenu(null)}
                />
              ) : null}

              <div
                className={cn("absolute top-3 flex flex-col gap-1", otherSideClass)}
                role="group"
                aria-label="Zoom"
              >
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
                  onClick={() => canvasRef.current?.zoomOut()}
                  aria-label="Dézoomer"
                  data-testid="zoom-out"
                >
                  <Minus className="size-5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => canvasRef.current?.fit()}
                  aria-label="Ajuster le plan"
                  data-testid="zoom-fit"
                >
                  <Maximize className="size-5" aria-hidden="true" />
                </Button>
              </div>

              {canEdit ? (
                <div
                  className={cn(
                    // Bottom third, thumb side: fixed above the bottom bar on a tablet (always
                    // reachable, whatever the scroll), in the corner of the plan on a computer.
                    "fixed bottom-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom,0px)+1rem)] z-30 flex flex-col items-center gap-2",
                    "lg:absolute lg:bottom-3",
                    side === "left" ? "left-4 lg:left-3" : "right-4 lg:right-3",
                  )}
                  data-testid="thumb-controls"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setSheet((s) => (s?.kind === "to-sort" ? null : { kind: "to-sort" }))
                    }
                    aria-label={`À ranger : ${toSort.length} photo${toSort.length > 1 ? "s" : ""}`}
                    data-testid="open-to-sort"
                    className="shadow-raised"
                  >
                    <Inbox className="size-5" aria-hidden="true" />
                    <CountBadge count={toSort.length} />
                  </Button>
                  <button
                    type="button"
                    className="relative flex size-16 items-center justify-center rounded-full bg-brand text-on-brand shadow-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
                    onClick={() => shutterCamera.current?.click()}
                    aria-label="Prendre une photo à ranger"
                    data-testid="shutter"
                  >
                    <Camera className="size-7" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex h-[58dvh] items-center justify-center rounded-lg border border-rule bg-craie text-ui text-ink-2">
              Chargement du plan…
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && current ? (
              <label className="flex items-center gap-2 text-ui text-ink-2">
                Zone
                <Select
                  value={currentZone}
                  onChange={(event) => setLastZone(current.view.id, event.target.value || null)}
                  aria-label="Zone par défaut sur cette vue"
                  data-testid="plan-zone"
                  className="w-48"
                >
                  <option value="">Sans zone</option>
                  {zones.map((zone) => (
                    <option key={zone.key} value={zone.key}>
                      {zone.label}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              aria-expanded={legendOpen}
              onClick={() => setLegendOpen((v) => !v)}
              data-testid="plan-legend-toggle"
            >
              <ListChecks className="size-5" aria-hidden="true" />
              Légende
            </Button>
          </div>
          {legendOpen ? (
            <div
              className="flex flex-col gap-2 rounded-lg border border-rule bg-paper p-3"
              data-testid="plan-legend"
            >
              <div className="flex items-center justify-between">
                <span className="label-caps text-ink-2">Légende</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLegendOpen(false)}
                  aria-label="Fermer la légende"
                >
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </div>
              <ul
                className="flex flex-wrap gap-x-5 gap-y-2 text-ui text-ink-2"
                aria-label="Types de repères"
              >
                <li className="flex items-center gap-2">
                  <MarkerPin number={1} hasPhoto showNumber={false} />
                  Photo
                </li>
                <li className="flex items-center gap-2">
                  <MarkerPin number={1} hasPhoto={false} showNumber={false} />
                  Repère sans photo
                </li>
                <li className="flex items-center gap-2">
                  <ReservePin
                    reserve={{ code: "R", status: "open", isOverdue: false }}
                    showCode={false}
                  />
                  Réserve ouverte ou en retard
                </li>
                <li className="flex items-center gap-2">
                  <ReservePin
                    reserve={{ code: "R", status: "done", isOverdue: false }}
                    showCode={false}
                  />
                  Réserve levée
                </li>
                <li className="flex items-center gap-2">
                  <NotePin />
                  Note
                </li>
              </ul>
              <label className="flex min-h-touch items-center gap-2 text-ui font-semibold text-ink">
                <input
                  type="checkbox"
                  className="size-5 accent-brand"
                  checked={!showDone}
                  onChange={(event) => {
                    const params = new URLSearchParams(window.location.search);
                    if (event.target.checked) params.delete("levees");
                    else params.set("levees", "afficher");
                    replaceQuery(params);
                  }}
                  data-testid="plan-hide-done"
                />
                Masquer les levées
              </label>
            </div>
          ) : null}

          <VisitFeedBar
            entries={feed}
            open={feedOpen}
            onToggle={() => setFeedOpen((v) => !v)}
            onOpenEntry={openEntry}
            undo={
              undo && canEdit
                ? {
                    label: undo.label,
                    run: () => {
                      const action = undo.run;
                      setUndo(null);
                      setSheet(null);
                      void action().then(() =>
                        toast({ variant: "success", title: "Saisie annulée" }),
                      );
                    },
                  }
                : null
            }
          />
        </div>
        {sheetNode}
      </div>

      {canEdit ? (
        <>
          <input
            ref={menuCamera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="quick-photo-input"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              photoTaken(files);
            }}
          />
          <input
            ref={shutterCamera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="shutter-input"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              shutterTaken(files);
            }}
          />
        </>
      ) : null}

      {reserveDraft ? (
        <ReserveSheet
          open
          onOpenChange={(open) => {
            if (!open) setReserveDraft(null);
          }}
          target={reserveDraft.target}
          visitId={visitId}
          siteId={data.visit.siteId}
          zones={zones}
          photos={data.photos}
          onSaved={(saved) => void reserveSaved(saved, reserveDraft)}
        />
      ) : null}
    </div>
  );
}
