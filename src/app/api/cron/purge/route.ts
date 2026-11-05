import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { isAuthorizedCronRequest } from "@/server/cron/auth";
import { runScheduledPurge } from "@/server/cron/purge";
import { log } from "@/server/log";
import { getStorageService } from "@/server/storage";

export const dynamic = "force-dynamic";
// Up to a few thousand objects to remove: leave time to the storage API.
export const maxDuration = 60;

/**
 * Nightly purge of abandoned uploads, called by Vercel Cron (`vercel.json`). A system task, not
 * a user page: no session, the caller is authenticated by `CRON_SECRET` (401 otherwise), and the
 * work runs under `withSystem('cron.purge')`.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), env.CRON_SECRET)) {
    log.warn("cron.purge.unauthorized");
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    const summary = await runScheduledPurge(getStorageService());
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    log.error("cron.purge.failed", { error });
    return NextResponse.json({ ok: false, error: "Purge impossible." }, { status: 500 });
  }
}
