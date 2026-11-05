import { NextResponse } from "next/server";

import { feedbackCsv } from "@/lib/feedback/csv";
import { parseFeedbackFilters } from "@/lib/feedback/list";
import { userMessage } from "@/server/errors";
import { listFeedback } from "@/server/services/feedback";

export const dynamic = "force-dynamic";

/** Admin: CSV of the feedback matching the filters of /admin/avis (role checked by the service). */
export async function GET(request: Request) {
  const filters = parseFeedbackFilters(Object.fromEntries(new URL(request.url).searchParams));
  try {
    const { rows } = await listFeedback(filters);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(feedbackCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="ronde-avis-${day}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    return NextResponse.json({ error: userMessage(error) }, { status });
  }
}
