import { CalendarClock, Camera, Flag, MapPin, MapPinned, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { overdueLabel } from "@/lib/reserves/dates";
import { RESERVE_PRIORITY_LABELS, type ReservePriority } from "@/server/domain/enums";
import type { ReserveListItem } from "@/server/reserves/types";

/** Priority as a neutral badge with its label (priorities are not statuses: no status colour). */
export function PriorityBadge({ priority }: { priority: ReservePriority }) {
  return (
    <Badge
      className={cn(
        priority === "urgent" && "bg-ink text-paper",
        priority === "low" && "bg-craie text-ink-2",
      )}
      data-priority={priority}
    >
      <Flag
        className={cn("size-3.5", priority === "urgent" || priority === "high" ? "" : "opacity-60")}
        aria-hidden="true"
      />
      {RESERVE_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/** Responsible line: label, « (inactif) », or « À désigner ». */
export function ResponsibleText({
  reserve,
}: {
  reserve: Pick<ReserveListItem, "responsibleLabel" | "responsibleInactive">;
}) {
  if (!reserve.responsibleLabel) return <span className="text-ink-2 italic">À désigner</span>;
  return (
    <span>
      {reserve.responsibleLabel}
      {reserve.responsibleInactive ? <span className="text-ink-2"> (inactif)</span> : null}
    </span>
  );
}

/** Status of a reserve, « En retard » when overdue. */
export function ReserveStatusPill({
  reserve,
}: {
  reserve: Pick<ReserveListItem, "status" | "isOverdue">;
}) {
  return <StatusPill status={reserve.status} overdue={reserve.isOverdue} />;
}

export interface ReserveCardProps {
  reserve: ReserveListItem;
  href: string;
  /** Extra line under the action (site page: original visit). */
  context?: ReactNode;
}

/**
 * Card of a reserve in a list: code, action (two lines), zone, priority, responsible (or
 * « À désigner »), due date, status, first thumbnail and plan icon. Overdue: red left border
 * and « En retard de N j »; done: dimmed with « Levée le … par … ». The whole card is a link
 * to the detail page.
 */
export function ReserveCard({ reserve, href, context }: ReserveCardProps) {
  const done = reserve.status === "done";
  return (
    <article
      className={cn(
        "relative flex gap-3 rounded-lg border border-rule bg-paper p-4",
        reserve.isOverdue && "border-l-4 border-l-status-open",
        done && "bg-craie",
      )}
      data-testid="reserve-card"
      data-code={reserve.code}
      data-status={reserve.status}
      data-overdue={reserve.isOverdue || undefined}
    >
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", done && "opacity-70")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-title-sm text-ink">{reserve.code}</span>
          <ReserveStatusPill reserve={reserve} />
          <PriorityBadge priority={reserve.priority} />
          {reserve.marker ? (
            <span className="inline-flex items-center text-ink-2" title="Placée sur un plan">
              <MapPinned className="size-4" aria-hidden="true" />
              <span className="sr-only">Placée sur un plan</span>
            </span>
          ) : null}
        </div>
        <h3 className="text-body font-semibold text-ink">
          <Link
            href={href}
            className="line-clamp-2 min-h-11 after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none after:focus-visible:outline-3 after:focus-visible:outline-offset-2 after:focus-visible:outline-brand"
            data-testid="reserve-card-link"
          >
            {reserve.action}
          </Link>
        </h3>
        {context ? <div className="text-ui text-ink-2">{context}</div> : null}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-ui text-ink-2">
          <div className="flex items-center gap-1">
            <dt>
              <MapPin className="size-4" aria-hidden="true" />
              <span className="sr-only">Zone</span>
            </dt>
            <dd>{reserve.zoneLabel ?? "Sans zone"}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>
              <User className="size-4" aria-hidden="true" />
              <span className="sr-only">Responsable</span>
            </dt>
            <dd className="text-ink">
              <ResponsibleText reserve={reserve} />
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>
              <CalendarClock className="size-4" aria-hidden="true" />
              <span className="sr-only">Échéance</span>
            </dt>
            <dd>{reserve.dueDate ? formatDate(reserve.dueDate) : "Sans échéance"}</dd>
          </div>
        </dl>
        {reserve.isOverdue ? (
          <p className="text-ui font-semibold text-status-open" data-testid="reserve-overdue">
            {overdueLabel(reserve.daysOverdue)}
          </p>
        ) : null}
        {done && reserve.closedAt ? (
          <p className="text-ui text-ink-2" data-testid="reserve-closed">
            Levée le {formatDate(reserve.closedAt)}
            {reserve.closedByName ? ` par ${reserve.closedByName}` : ""}
          </p>
        ) : null}
      </div>
      <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-galet text-ink-2">
        {reserve.firstThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img
            src={reserve.firstThumbUrl}
            alt=""
            width={80}
            height={80}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <Camera className="size-6 opacity-50" aria-hidden="true" />
        )}
        {reserve.photosCount > 1 ? (
          <span className="absolute right-1 bottom-1 rounded-pill bg-paper px-1.5 text-label text-ink">
            {reserve.photosCount}
          </span>
        ) : null}
        <span className="sr-only">
          {reserve.photosCount === 0
            ? "Aucune photo"
            : `${reserve.photosCount} photo${reserve.photosCount > 1 ? "s" : ""}`}
        </span>
      </div>
    </article>
  );
}
