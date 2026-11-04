import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ReserveDetailView } from "@/components/reserves/reserve-detail";
import { UploadQueueProvider } from "@/components/visits/photos/upload-queue-provider";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { listPhotos } from "@/server/services/photos";
import { getReserve, getReserveHistory } from "@/server/services/reserves";
import { getVisit } from "@/server/services/visits";
import { listZoneNotes } from "@/server/services/zone-notes";

type Params = Promise<{ id: string; reserveId: string }>;

async function loadReserve(reserveId: string) {
  try {
    return await getReserve(reserveId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { reserveId } = await params;
  if (!z.uuid().safeParse(reserveId).success) return { title: "Réserve" };
  const reserve = await loadReserve(reserveId);
  return { title: reserve ? `Réserve ${reserve.code}` : "Réserve" };
}

/** Detail of a reserve: every field, photos, plan link, history and the editor's actions. */
export default async function ReservePage({ params }: { params: Params }) {
  await requireUser();
  const { id, reserveId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(reserveId).success) notFound();
  const [visit, reserve] = await Promise.all([getVisit(id), loadReserve(reserveId)]);
  if (!visit || !reserve || reserve.visitId !== visit.id) notFound();
  const [history, notes, photos] = await Promise.all([
    getReserveHistory(reserveId),
    listZoneNotes(id),
    listPhotos(id),
  ]);
  return (
    <UploadQueueProvider visitId={visit.id}>
      <ReserveDetailView
        key={`${reserve.id}-${reserve.version}-${visit.permissions.canEdit}`}
        reserve={reserve}
        history={history}
        visit={{
          id: visit.id,
          title: visit.title,
          siteId: visit.siteId,
          status: visit.status,
        }}
        canEdit={visit.permissions.canEdit}
        zones={notes.map((note) => ({ key: note.zoneKey, label: note.zoneLabel }))}
        photos={photos}
      />
    </UploadQueueProvider>
  );
}
