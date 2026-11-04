import { Map as MapIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { markersLabel, pagesLabel } from "@/server/domain/plans";
import type { PlanView } from "@/server/plans/types";

/**
 * Summary of a plan: first-page thumbnail (reserved 4:3 box, lazy), name, page count, author
 * and date, « Archivé » badge, and the markers of the current visit when given.
 */
export function PlanCard({
  plan,
  showMarkers = false,
  actions,
}: {
  plan: PlanView;
  showMarkers?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-rule bg-paper">
        {plan.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img
            src={plan.thumbUrl}
            alt=""
            loading="lazy"
            width={96}
            height={64}
            className="h-16 w-24 object-contain"
          />
        ) : (
          <MapIcon className="size-6 text-ink-2" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
          <span className="truncate" data-testid="plan-name">
            {plan.name}
          </span>
          {plan.isArchived ? <Badge data-testid="plan-archived">Archivé</Badge> : null}
        </p>
        <p className="text-ui text-ink-2">
          {pagesLabel(plan.pageCount)}
          {showMarkers ? (
            <span data-testid="plan-markers-count"> · {markersLabel(plan.markersCount)}</span>
          ) : null}
          {" · "}
          {plan.uploadedByName ? `${plan.uploadedByName}, ` : ""}
          {formatDate(plan.createdAt)}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
