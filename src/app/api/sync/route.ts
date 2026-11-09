import { NextResponse } from "next/server";
import { z } from "zod";

import { type SyncOperation, syncRequestSchema } from "@/lib/offline/ops";
import { getSessionStatus, hasRole } from "@/server/auth/session";
import { log } from "@/server/log";
import { applyDeviceOperations } from "@/server/services/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Synchronisation of the device outbox (step 12): a batch of at most 50 operations, applied
 * in order as the user (`withUser`, one transaction each) through the same services as the
 * server actions. The answer carries one result per operation. A 401 names the reason
 * (`signed_out`, `revoked`, `inactive`) so that the device keeps or wipes its local copy.
 */
export async function POST(request: Request) {
  const session = await getSessionStatus();
  if (session.kind !== "ok") {
    return NextResponse.json({ error: session.kind }, { status: 401 });
  }
  if (!hasRole(session.user, ["rt", "admin"])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    log.warn("sync.invalid_request", { issues: z.treeifyError(parsed.error) });
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const results = await applyDeviceOperations(parsed.data.ops as SyncOperation[]);
  return NextResponse.json({ results, serverTime: new Date().toISOString() });
}
