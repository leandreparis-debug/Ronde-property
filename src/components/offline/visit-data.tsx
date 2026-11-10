"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ConflictEntry,
  LocalMarker,
  LocalNote,
  LocalPhoto,
  LocalPlan,
  LocalReserve,
  LocalVisit,
  OutboxEntry,
  RondeLocalDb,
} from "@/lib/offline/db";
import { blobKeys } from "@/lib/offline/db";
import { mergeSnapshot } from "@/lib/offline/merge";
import type { VisitSnapshot } from "@/lib/offline/snapshot";
import type { Participant } from "@/server/domain";
import type { PlanPageView } from "@/server/plans/types";
import type { SiteBuildingView, SiteViewView } from "@/lib/plans/structure";
import type { ReportView } from "@/server/reports/service";
import type { ReserveDetail } from "@/server/reserves/types";

import { useOptionalOffline } from "./offline-provider";

/** Everything the visit screens display, from the local store or (before it) the server. */
export interface VisitData {
  visit: LocalVisit;
  participants: Participant[];
  notes: LocalNote[];
  /** Photos with displayable URLs (local blobs first), ready and waiting ones. */
  photos: LocalPhoto[];
  plans: LocalPlan[];
  /** Pages of each plan, with displayable URLs. */
  planPages: Record<string, PlanPageView[]>;
  markers: LocalMarker[];
  /** Buildings of the site (step 12 b), archived ones included. */
  buildings: SiteBuildingView[];
  /** Views of the site (exterior view, levels), archived and replaced ones included. */
  views: SiteViewView[];
  /**
   * Reserves; one created offline has the code « R-? » and sorts after the numbered ones
   * (`number` = `Number.MAX_SAFE_INTEGER`) until the server numbers it.
   */
  reserves: ReserveDetail[];
  reports: ReportView[];
  /** Entities with an operation waiting (« en attente » dots). */
  pendingIds: Set<string>;
  conflicts: ConflictEntry[];
  outbox: OutboxEntry[];
  /** `store`: read from IndexedDB; `server`: the server snapshot, before the store is ready. */
  source: "store" | "server";
}

/** Data of the visit from a server snapshot alone (first render, server render). */
export function dataFromSnapshot(snapshot: VisitSnapshot): VisitData {
  return {
    visit: {
      ...snapshot.visit,
      kept: false,
      keptAt: null,
      snapshotAt: snapshot.fetchedAt,
      writers: snapshot.writers,
      reportOptions: snapshot.reportOptions,
      canCreate: snapshot.canCreate,
      userRole: snapshot.user.role,
    },
    participants: [...snapshot.participants].sort((a, b) => a.sortOrder - b.sortOrder),
    notes: snapshot.notes
      .map((note) => ({ ...note, visitId: snapshot.visit.id }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    photos: snapshot.photos.map((photo) => ({ ...photo, uploadStatus: "ready" as const })),
    plans: snapshot.plans.map((plan) => ({
      ...plan,
      visitId: snapshot.visit.id,
      originalUrl: snapshot.planOriginals[plan.id] ?? null,
    })),
    planPages: snapshot.planPages,
    markers: snapshot.markers,
    buildings: snapshot.buildings ?? [],
    views: snapshot.views ?? [],
    reserves: snapshot.reserves,
    reports: snapshot.reports,
    pendingIds: new Set(),
    conflicts: [],
    outbox: [],
    source: "server",
  };
}

/**
 * Object URLs of the blobs stored for a visit (photos, plan pages), keyed like `blobKeys`.
 * Only the keys are watched; each blob is read once and its URL revoked when it goes away.
 */
export function useBlobUrls(db: RondeLocalDb | null, visitId: string): Map<string, string> {
  const keys = useLiveQuery(
    async () =>
      db ? ((await db.blobs.where("visitId").equals(visitId).primaryKeys()) as string[]) : [],
    [db, visitId],
  );
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const current = useRef(new Map<string, string>());

  useEffect(() => {
    if (!db || !keys) return;
    let cancelled = false;
    const wanted = new Set(keys);
    void (async () => {
      const next = new Map(current.current);
      let changed = false;
      for (const [key, url] of next) {
        if (!wanted.has(key)) {
          URL.revokeObjectURL(url);
          next.delete(key);
          changed = true;
        }
      }
      for (const key of keys) {
        if (next.has(key)) continue;
        const row = await db.blobs.get(key);
        if (cancelled) return;
        if (row) {
          next.set(key, URL.createObjectURL(row.blob));
          changed = true;
        }
      }
      if (!cancelled && changed) {
        current.current = next;
        setUrls(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, keys]);

  useEffect(
    () => () => {
      for (const url of current.current.values()) URL.revokeObjectURL(url);
      current.current = new Map();
    },
    [],
  );

  return urls;
}

interface StoreRows {
  visit: LocalVisit | undefined;
  participants: Participant[];
  notes: LocalNote[];
  photos: LocalPhoto[];
  plans: LocalPlan[];
  pages: Array<PlanPageView & { planId: string }>;
  markers: LocalMarker[];
  buildings: SiteBuildingView[];
  views: SiteViewView[];
  reserves: LocalReserve[];
  reports: ReportView[];
  outbox: OutboxEntry[];
  conflicts: ConflictEntry[];
}

async function readStore(db: RondeLocalDb, visitId: string): Promise<StoreRows> {
  const [visit, participants, notes, photos, plans, markers, reserves, reports, outbox, conflicts] =
    await Promise.all([
      db.visits.get(visitId),
      db.participants.where("visitId").equals(visitId).toArray(),
      db.notes.where("visitId").equals(visitId).toArray(),
      db.photos.where("visitId").equals(visitId).toArray(),
      db.plans.where("visitId").equals(visitId).toArray(),
      db.markers.where("visitId").equals(visitId).toArray(),
      db.reserves.where("visitId").equals(visitId).toArray(),
      db.reports.where("visitId").equals(visitId).toArray(),
      db.outbox.where("visitId").equals(visitId).toArray(),
      db.conflicts.where("visitId").equals(visitId).toArray(),
    ]);
  const [buildings, views] = await Promise.all([
    db.buildings.where("visitId").equals(visitId).toArray(),
    db.views.where("visitId").equals(visitId).toArray(),
  ]);
  const pages = plans.length
    ? await db.planPages
        .where("planId")
        .anyOf(plans.map((plan) => plan.id))
        .toArray()
    : [];
  return {
    visit,
    participants,
    notes,
    photos,
    plans,
    pages,
    markers,
    buildings,
    views,
    reserves,
    reports,
    outbox,
    conflicts,
  };
}

/** Applies the local blob URLs to what is displayed (offline copy, photos not yet sent). */
function withImages(rows: StoreRows, urls: Map<string, string>): VisitData {
  const photos = rows.photos
    .map((photo) => ({
      ...photo,
      url: urls.get(blobKeys.photoMain(photo.id)) ?? photo.url,
      thumbUrl: urls.get(blobKeys.photoThumb(photo.id)) ?? photo.thumbUrl,
    }))
    .sort((a, b) =>
      a.uploadStatus === b.uploadStatus
        ? a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
        : a.uploadStatus === "ready"
          ? -1
          : 1,
    );
  const byPhoto = new Map(photos.map((photo) => [photo.id, photo]));
  const planPages: Record<string, PlanPageView[]> = {};
  for (const page of rows.pages.sort((a, b) => a.pageNumber - b.pageNumber)) {
    const { planId, ...view } = page;
    (planPages[planId] ??= []).push({
      ...view,
      imageUrl: urls.get(blobKeys.pageImage(planId, page.pageNumber)) ?? view.imageUrl,
      thumbUrl: urls.get(blobKeys.pageThumb(planId, page.pageNumber)) ?? view.thumbUrl,
    });
  }
  const plans = rows.plans
    .map((plan) => ({
      ...plan,
      thumbUrl: urls.get(blobKeys.pageThumb(plan.id, 1)) ?? plan.thumbUrl,
    }))
    .sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || a.name.localeCompare(b.name));
  const markers = rows.markers.map((marker) => {
    const photo = marker.photoId ? byPhoto.get(marker.photoId) : null;
    return {
      ...marker,
      photoThumbUrl: photo?.thumbUrl ?? marker.photoThumbUrl,
      photoCaption: photo ? photo.caption : marker.photoCaption,
    };
  });
  const reserves = rows.reserves
    .map((reserve) => {
      const reservePhotos = reserve.photos.map((photo) => {
        const local = byPhoto.get(photo.id);
        return local
          ? { ...photo, thumbUrl: local.thumbUrl, url: local.url, caption: local.caption }
          : photo;
      });
      return {
        ...reserve,
        number: reserve.number ?? Number.MAX_SAFE_INTEGER,
        photos: reservePhotos,
        firstThumbUrl: reservePhotos[0]?.thumbUrl ?? reserve.firstThumbUrl,
      };
    })
    .sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt));
  return {
    visit: rows.visit!,
    participants: [...rows.participants].sort((a, b) => a.sortOrder - b.sortOrder),
    notes: [...rows.notes].sort((a, b) => a.sortOrder - b.sortOrder),
    photos,
    plans,
    planPages,
    markers,
    buildings: rows.buildings,
    views: rows.views,
    reserves,
    reports: [...rows.reports].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    pendingIds: new Set(rows.outbox.map((entry) => entry.entityId)),
    conflicts: rows.conflicts,
    outbox: rows.outbox.sort((a, b) => a.seq - b.seq),
    source: "store",
  };
}

/**
 * Live data of a visit. The server snapshot (when given) is merged into the store first; until
 * then, and wherever IndexedDB is not available, the snapshot itself is displayed. Returns
 * `null` when neither the server nor the store knows the visit (offline, not kept).
 */
export function useVisitData(
  visitId: string,
  snapshot: VisitSnapshot | null,
): { data: VisitData | null; loading: boolean } {
  const offline = useOptionalOffline();
  const db = offline?.db ?? null;
  const [mergedAt, setMergedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !snapshot) return;
    let cancelled = false;
    void mergeSnapshot(db, snapshot)
      .catch(() => "failed")
      .then(() => {
        if (!cancelled) setMergedAt(snapshot.fetchedAt);
      });
    return () => {
      cancelled = true;
    };
  }, [db, snapshot]);

  const rows = useLiveQuery(async () => (db ? readStore(db, visitId) : null), [db, visitId]);
  const urls = useBlobUrls(db, visitId);

  const fromServer = useMemo(() => (snapshot ? dataFromSnapshot(snapshot) : null), [snapshot]);
  const fromStore = useMemo(() => (rows?.visit ? withImages(rows, urls) : null), [rows, urls]);

  // Once the store has been shown, later snapshots (server refresh) merge underneath it.
  const shownStore = useRef(false);
  const storeReady =
    Boolean(fromStore) && (shownStore.current || !snapshot || mergedAt === snapshot.fetchedAt);
  if (storeReady) {
    shownStore.current = true;
    return { data: fromStore, loading: false };
  }
  if (fromServer) return { data: fromServer, loading: false };
  // No snapshot: wait for the store before saying the visit is not available.
  return { data: null, loading: rows === undefined || (db === null && offline !== null) };
}

const VisitDataContext = createContext<VisitData | null>(null);

/** Shares the live data of the visit with every tab. */
export function VisitDataProvider({ value, children }: { value: VisitData; children: ReactNode }) {
  return <VisitDataContext.Provider value={value}>{children}</VisitDataContext.Provider>;
}

/** The live data of the current visit. */
export function useVisit(): VisitData {
  const value = useContext(VisitDataContext);
  if (!value) throw new Error("useVisit doit être utilisé sous <VisitDataProvider>.");
  return value;
}

/** The live data of the current visit, or null outside a visit. */
export function useOptionalVisit(): VisitData | null {
  return useContext(VisitDataContext);
}
