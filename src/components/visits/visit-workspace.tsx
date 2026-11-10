"use client";

import { CloudCheck } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { useOffline } from "@/components/offline/offline-provider";
import {
  useVisit,
  useVisitData,
  type VisitData,
  VisitDataProvider,
} from "@/components/offline/visit-data";
import { ReportTab } from "@/components/report/report-tab";
import { ReservesTab } from "@/components/reserves/reserves-tab";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchBlob, keepVisitOffline } from "@/lib/offline/keep";
import type { VisitSnapshot } from "@/lib/offline/snapshot";
import { isZoneFilled } from "@/lib/notes/format";
import { reserveIncompleteCounts } from "@/lib/reserves/list";
import { incompletePoints } from "@/server/domain/visits";
import type { PhotoMarkerLink } from "@/server/plans/types";

import { NotesTab } from "./notes/notes-tab";
import { PhotosTab } from "./photos/photos-tab";
import { UploadQueuePill } from "./photos/upload-queue-pill";
import { UploadQueueProvider } from "./photos/upload-queue-provider";
import { VisitPlanScreen } from "./plan-screen/visit-plan-screen";
import { VisitActions } from "./visit-actions";
import { VisitBanner } from "./visit-banner";
import { VisitHeader } from "./visit-header";
import { VisitInformationTab } from "./visit-information-tab";
import { VisitTabs } from "./visit-tabs";

/** Badge « Disponible hors réseau » of a visit kept on the device. */
export function KeptBadge() {
  return (
    <Badge variant="brand" data-testid="kept-offline-badge">
      <CloudCheck className="size-4" aria-hidden="true" />
      Disponible hors réseau
    </Badge>
  );
}

/** Counters, incomplete points and cross-links of the visit, computed from its data. */
function useDerived(data: VisitData) {
  return useMemo(() => {
    const { notes, photos, markers, reserves, participants, visit, plans } = data;
    const filledZonesCount = notes.filter((note) => isZoneFilled(note.content)).length;
    const uncaptionedPhotosCount = photos.filter((photo) => !photo.caption).length;
    const photoIds = new Set(photos.map((photo) => photo.id));
    const markersWithoutPhotoCount = markers.filter(
      (marker) =>
        marker.kind !== "note" &&
        !marker.reserve &&
        (!marker.photoId || !photoIds.has(marker.photoId)),
    ).length;
    const toSortPhotosCount = photos.filter((photo) => photo.toSort).length;
    const reserveCounts = reserveIncompleteCounts(reserves);
    const reservesByZone: Record<string, { open: number; done: number }> = {};
    for (const reserve of reserves) {
      if (!reserve.zoneKey) continue;
      const counts = (reservesByZone[reserve.zoneKey] ??= { open: 0, done: 0 });
      if (reserve.status === "done") counts.done += 1;
      else counts.open += 1;
    }
    const reservesByPhoto: Record<string, Array<{ reserveId: string; code: string }>> = {};
    for (const reserve of reserves) {
      for (const photo of reserve.photos) {
        (reservesByPhoto[photo.id] ??= []).push({ reserveId: reserve.id, code: reserve.code });
      }
    }
    const planNames = new Map(plans.map((plan) => [plan.id, plan.name]));
    const markersByPhoto: Record<string, PhotoMarkerLink> = {};
    for (const marker of markers) {
      if (!marker.photoId || marker.number === null) continue;
      markersByPhoto[marker.photoId] = {
        markerId: marker.id,
        number: marker.number,
        planId: marker.planId,
        planName: planNames.get(marker.planId) ?? "Plan",
        page: marker.page,
      };
    }
    const points = incompletePoints({
      writerId: visit.writerId,
      subject: visit.subject,
      participantsCount: participants.length,
      filledZonesCount,
      uncaptionedPhotosCount,
      markersWithoutPhotoCount,
      toSortPhotosCount,
      reserves: reserveCounts,
    });
    return {
      filledZonesCount,
      uncaptionedPhotosCount,
      markersWithoutPhotoCount,
      toSortPhotosCount,
      reserveCounts,
      reservesByZone,
      reservesByPhoto,
      markersByPhoto,
      points,
      zones: notes.map((note) => ({ key: note.zoneKey, label: note.zoneLabel })),
    };
  }, [data]);
}

/**
 * Keeps automatically, on a touch device, the visit in progress the user can edit (option of
 * the account menu): its photos and plan pages are downloaded in the background.
 */
function useAutoKeep(data: VisitData, snapshot: VisitSnapshot | null) {
  const { db, online, autoKeep, refreshUsage } = useOffline();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !db || !online || !autoKeep || !snapshot) return;
    if (data.source !== "store" || data.visit.kept) return;
    if (!data.visit.permissions.canEdit || data.visit.status !== "in_progress") return;
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    started.current = true;
    void keepVisitOffline(db, snapshot, { fetchBlob }).then(() => refreshUsage());
  }, [db, online, autoKeep, snapshot, data, refreshUsage]);
}

function VisitScreen({ snapshot }: { snapshot: VisitSnapshot | null }) {
  const { user, online } = useOffline();
  const data = useVisit();
  const derived = useDerived(data);
  useAutoKeep(data, snapshot);
  const { visit } = data;
  const canEdit = visit.permissions.canEdit;
  const canCreate = visit.canCreate;
  const pendingCount = data.outbox.length;
  const reportBlocked = !online
    ? "Hors réseau : le rapport est généré avec le réseau, pour être conservé dans l'historique."
    : pendingCount > 0 || data.conflicts.length > 0
      ? "Des modifications de la visite attendent d'être synchronisées : le rapport sera généré une fois tout envoyé."
      : null;

  return (
    <>
      <VisitHeader
        visit={visit}
        zones={{ filled: derived.filledZonesCount, total: data.notes.length }}
        photosCount={data.photos.length}
        status={
          <>
            {visit.kept ? <KeptBadge /> : null}
            <UploadQueuePill />
          </>
        }
        actions={
          <VisitActions
            visit={visit}
            canCreate={canCreate}
            incomplete={derived.points}
            pendingCount={pendingCount}
            conflictsCount={data.conflicts.length}
            kept={visit.kept}
          />
        }
      />
      <VisitBanner visit={visit} user={{ role: user.role }} />
      <VisitTabs
        defaultScreen={data.views.length === 0 && !canCreate ? "liste" : "plan"}
        plan={
          <VisitPlanScreen
            key={`plan-${visit.status}-${canEdit}`}
            visitId={visit.id}
            canEdit={canEdit}
            canConfigure={canCreate}
            zones={derived.zones}
          />
        }
        notes={
          <NotesTab
            key={`${visit.status}-${canEdit}`}
            visitId={visit.id}
            visitType={visit.type}
            canEdit={canEdit}
            userId={user.id}
            photos={data.photos}
            reservesByZone={derived.reservesByZone}
          />
        }
        reserves={
          <ReservesTab
            key={`reserves-${visit.status}-${canEdit}`}
            visitId={visit.id}
            siteId={visit.siteId}
            reserves={data.reserves}
            pendingIds={data.pendingIds}
            zones={derived.zones}
            photos={data.photos}
            canEdit={canEdit}
          />
        }
        report={
          <ReportTab
            visitId={visit.id}
            initialReports={data.reports}
            initialOptions={visit.reportOptions}
            photos={data.photos.filter((photo) => photo.uploadStatus === "ready")}
            incomplete={derived.points}
            blockedReason={reportBlocked}
          />
        }
        photos={
          <PhotosTab
            key={`${visit.status}-${canEdit}`}
            visitId={visit.id}
            photos={data.photos}
            zones={derived.zones}
            canEdit={canEdit}
            markersByPhoto={derived.markersByPhoto}
            reservesByPhoto={derived.reservesByPhoto}
            pendingIds={data.pendingIds}
          />
        }
        information={
          <VisitInformationTab
            key={`${visit.status}-${canEdit}`}
            visit={visit}
            participants={data.participants}
            pendingIds={data.pendingIds}
            writers={visit.writers}
            filledZonesCount={derived.filledZonesCount}
            uncaptionedPhotosCount={derived.uncaptionedPhotosCount}
            markersWithoutPhotoCount={derived.markersWithoutPhotoCount}
            toSortPhotosCount={derived.toSortPhotosCount}
            reserveCounts={derived.reserveCounts}
          />
        }
      />
    </>
  );
}

/** Message of a visit that is neither reachable nor kept on the device. */
export function VisitUnavailable() {
  return (
    <EmptyState
      mood="asleep"
      title="Cette visite n'est pas disponible hors réseau"
      description="Elle n'a pas été gardée sur cette tablette. Ouvrez-la avec le réseau, puis choisissez « Garder hors réseau » dans ses actions."
      className="py-16"
    />
  );
}

/**
 * The visit screen (header, actions, banner, Plan / Liste / Rapport), rendered from the local store once
 * the server snapshot is merged into it, or from the snapshot until then. Without a snapshot
 * (offline shell), the store alone.
 */
export function VisitWorkspace({
  visitId,
  snapshot,
}: {
  visitId: string;
  snapshot: VisitSnapshot | null;
}) {
  const { data, loading } = useVisitData(visitId, snapshot);
  if (!data) {
    return loading ? (
      <div className="flex flex-col gap-4 py-8" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    ) : (
      <VisitUnavailable />
    );
  }
  return (
    <VisitDataProvider value={data}>
      <UploadQueueProvider visitId={visitId}>
        <VisitScreen snapshot={snapshot} />
      </UploadQueueProvider>
    </VisitDataProvider>
  );
}
