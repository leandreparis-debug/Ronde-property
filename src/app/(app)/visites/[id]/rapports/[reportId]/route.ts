import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError } from "@/server/errors";
import { reportDownloadUrl } from "@/server/services/reports";

/**
 * Download of a ready report: the right is checked under RLS (`withUser`), then the browser
 * is redirected to a signed URL valid 10 minutes, saved under the report file name. The PDF
 * never goes through the server.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> },
) {
  const { id, reportId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(reportId).success) {
    return new NextResponse("Rapport introuvable.", { status: 404 });
  }
  try {
    const { url, visitId } = await reportDownloadUrl(reportId);
    if (visitId !== id) return new NextResponse("Rapport introuvable.", { status: 404 });
    return NextResponse.redirect(new URL(url, request.url), 302);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    if (status === 401) {
      const next = `/visites/${id}?onglet=report`;
      return NextResponse.redirect(
        new URL(`/connexion?next=${encodeURIComponent(next)}`, request.url),
      );
    }
    return new NextResponse(
      status === 404 ? "Rapport introuvable." : "Téléchargement impossible.",
      {
        status: status === 404 || status === 403 ? 404 : status,
      },
    );
  }
}
