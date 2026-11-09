"use client";

import { useVisitData, VisitDataProvider } from "@/components/offline/visit-data";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadQueueProvider } from "@/components/visits/photos/upload-queue-provider";
import { VisitUnavailable } from "@/components/visits/visit-workspace";
import type { VisitSnapshot } from "@/lib/offline/snapshot";
import type { ReserveHistoryEntry } from "@/server/reserves/types";

import { ReserveDetailView } from "./reserve-detail";

/**
 * Detail of a reserve read from the local store (with the server snapshot merged first), so
 * that it opens and changes offline too. The history comes from the server only.
 */
export function ReserveDetailWorkspace({
  visitId,
  reserveId,
  snapshot,
  history,
}: {
  visitId: string;
  reserveId: string;
  snapshot: VisitSnapshot | null;
  history: ReserveHistoryEntry[] | null;
}) {
  const { data, loading } = useVisitData(visitId, snapshot);
  if (!data) {
    return loading ? (
      <div className="flex flex-col gap-4 py-8" aria-busy="true">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    ) : (
      <VisitUnavailable />
    );
  }
  const reserve = data.reserves.find((candidate) => candidate.id === reserveId);
  if (!reserve) {
    return (
      <EmptyState
        mood="asleep"
        title="Réserve introuvable"
        description="Elle a peut-être été supprimée, ou elle n'est pas dans la copie de cette tablette."
      />
    );
  }
  const { visit } = data;
  return (
    <VisitDataProvider value={data}>
      <UploadQueueProvider visitId={visitId}>
        <ReserveDetailView
          key={`${reserve.id}-${visit.permissions.canEdit}-${visit.status}`}
          reserve={reserve}
          history={history}
          pending={data.pendingIds.has(reserve.id)}
          visit={{ id: visit.id, title: visit.title, siteId: visit.siteId, status: visit.status }}
          canEdit={visit.permissions.canEdit}
          zones={data.notes.map((note) => ({ key: note.zoneKey, label: note.zoneLabel }))}
          photos={data.photos}
        />
      </UploadQueueProvider>
    </VisitDataProvider>
  );
}
