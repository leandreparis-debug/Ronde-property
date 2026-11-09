import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ReserveDetailWorkspace } from "@/components/reserves/reserve-detail-workspace";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getReserve, getReserveHistory } from "@/server/services/reserves";
import { getVisitSnapshot } from "@/server/services/sync";

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
  const snapshot = await getVisitSnapshot(id);
  if (!snapshot || !snapshot.reserves.some((reserve) => reserve.id === reserveId)) notFound();
  const history = await getReserveHistory(reserveId);
  return (
    <ReserveDetailWorkspace
      visitId={id}
      reserveId={reserveId}
      snapshot={snapshot}
      history={history}
    />
  );
}
