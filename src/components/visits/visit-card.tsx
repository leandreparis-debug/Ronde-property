import { Camera, ChevronRight, FileText, MapPin, NotebookPen } from "lucide-react";
import Link from "next/link";

import { KeptMark } from "@/components/offline/kept-mark";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "@/lib/format";
import type { VisitSummary } from "@/server/domain";
import { VISIT_REASON_LABELS } from "@/server/domain/labels";

import { zonesLabel } from "./visit-header";
import { VisitStatusBadge } from "./visit-status-badge";

/**
 * Clickable visit card: date, title, site, reason, status and counters; « Dernier rapport »
 * downloads the last stored report.
 */
export function VisitCard({ visit }: { visit: VisitSummary }) {
  return (
    <Card className="transition-colors hover:bg-brand-tint">
      <Link
        href={`/visites/${visit.id}`}
        className="flex min-h-touch-lg items-center gap-4 rounded-lg p-4"
        data-testid={`visit-${visit.id}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-ui text-ink-2">
            <span className="font-semibold text-ink">{formatDate(visit.visitDate, "weekday")}</span>
            <VisitStatusBadge status={visit.status} />
            <Badge>{VISIT_REASON_LABELS[visit.reason]}</Badge>
            <KeptMark visitId={visit.id} />
          </div>
          <p className="truncate text-body font-semibold text-ink">{visit.title}</p>
          <p className="flex items-center gap-1 text-ui text-ink-2">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {visit.siteCode} · {visit.siteName}
              {visit.siteCity ? ` · ${visit.siteCity}` : ""}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-ui text-ink-2">
            <span>
              {visit.openReservesCount} réserve{visit.openReservesCount > 1 ? "s" : ""} ouverte
              {visit.openReservesCount > 1 ? "s" : ""}
            </span>
            {visit.overdueReservesCount > 0 ? <StatusPill status="open" overdue /> : null}
            <span>
              {visit.doneReservesCount} levée{visit.doneReservesCount > 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <Camera className="size-4" aria-hidden="true" />
              {visit.photosCount} photo{visit.photosCount > 1 ? "s" : ""}
            </span>
            {visit.zonesCount > 0 ? (
              <span className="inline-flex items-center gap-1" data-testid="zones-counter">
                <NotebookPen className="size-4" aria-hidden="true" />
                {zonesLabel(visit.filledZonesCount, visit.zonesCount)}
              </span>
            ) : null}
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-2" aria-hidden="true" />
      </Link>
      {visit.lastReportId && visit.lastReportAt ? (
        <a
          href={`/visites/${visit.id}/rapports/${visit.lastReportId}`}
          className="mx-4 -mt-2 mb-3 inline-flex min-h-11 items-center gap-1.5 text-ui font-semibold text-brand-deep underline"
          data-testid="visit-last-report"
        >
          <FileText className="size-4" aria-hidden="true" />
          Dernier rapport ({formatDate(visit.lastReportAt)})
        </a>
      ) : null}
    </Card>
  );
}
