import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionStatus } from "@/server/auth/session";
import { getVisitSnapshot } from "@/server/services/sync";

export const dynamic = "force-dynamic";

/**
 * Snapshot of a visit for the local store (« Garder hors réseau », refresh after a sync):
 * every table read as the user under RLS, with signed URLs for the download of the offline
 * copy. 401 with the reason when the session is gone, 404 when the visit is not visible.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSessionStatus();
  if (session.kind !== "ok") {
    return NextResponse.json({ error: session.kind }, { status: 401 });
  }
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const snapshot = await getVisitSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
