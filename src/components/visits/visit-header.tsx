import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { photosCountLabel } from "@/server/domain/photos";
import { VISIT_REASON_LABELS } from "@/server/domain/labels";
import type { VisitDetail } from "@/server/repositories/visit-repository";

import { VisitStatusBadge } from "./visit-status-badge";

/** « 6/9 zones renseignées », computed from the loaded notes, never stored. */
export function zonesLabel(filled: number, total: number): string {
  const plural = total > 1 ? "s" : "";
  return `${filled}/${total} zone${plural} renseignée${plural}`;
}

/** Title block of a visit: site link, title, reason / status / date badges, writer, zones. */
export function VisitHeader({
  visit,
  zones,
  photosCount,
  status,
  actions,
}: {
  visit: VisitDetail;
  zones?: { filled: number; total: number };
  /** Ready photos of the visit. */
  photosCount?: number;
  /** Live indicators (upload pill) shown next to the badges. */
  status?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-6 md:py-8">
      <nav aria-label="Fil d'Ariane" className="text-ui text-ink-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-semibold text-brand-deep hover:underline"
        >
          Visites
        </Link>
        <span aria-hidden="true"> › </span>
        <span className="text-ink">{visit.title}</span>
      </nav>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={`/sites/${encodeURIComponent(visit.site.code)}`}
            className="inline-flex min-h-11 items-center label-caps text-ink-2 hover:text-brand-deep"
          >
            {visit.site.code} · {visit.site.name}
            {visit.site.city ? ` · ${visit.site.city}` : ""}
          </Link>
          <h1 className="font-display text-title text-ink">{visit.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{VISIT_REASON_LABELS[visit.reason]}</Badge>
            <VisitStatusBadge status={visit.status} />
            <Badge>{formatDate(visit.visitDate, "weekday")}</Badge>
            {status}
          </div>
          <p className="text-ui text-ink-2">
            Rédigée par {visit.writerName ?? "—"}
            {zones && zones.total > 0 ? (
              <span data-testid="zones-counter"> · {zonesLabel(zones.filled, zones.total)}</span>
            ) : null}
            {photosCount !== undefined ? (
              <span data-testid="photos-counter"> · {photosCountLabel(photosCount)}</span>
            ) : null}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
