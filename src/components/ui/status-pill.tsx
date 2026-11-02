import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Lifecycle of a reserve. */
export type ReserveStatus = "open" | "in_progress" | "done";

export const RESERVE_STATUS_LABELS: Record<ReserveStatus, string> = {
  open: "Ouverte",
  in_progress: "En cours",
  done: "Levée",
};

/** Label shown when a reserve is past its due date. */
export const OVERDUE_LABEL = "En retard";

const STYLES: Record<ReserveStatus, { pill: string; dot: string }> = {
  open: { pill: "bg-status-open-bg text-status-open", dot: "bg-status-open-dot" },
  in_progress: {
    pill: "bg-status-progress-bg text-status-progress",
    dot: "bg-status-progress-dot",
  },
  done: { pill: "bg-status-done-bg text-status-done", dot: "bg-status-done" },
};

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: ReserveStatus;
  /** Past due date: shows « En retard » with the `open` styling, whatever the status. */
  overdue?: boolean;
}

/**
 * Status of a reserve. The coloured dot is always accompanied by its text label,
 * so the information never relies on colour alone.
 *
 * @example
 * <StatusPill status="open" overdue />  // « En retard »
 */
export function StatusPill({ status, overdue = false, className, ...props }: StatusPillProps) {
  const visual = overdue ? "open" : status;
  const label = overdue ? OVERDUE_LABEL : RESERVE_STATUS_LABELS[status];
  const styles = STYLES[visual];

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-ui font-semibold whitespace-nowrap",
        styles.pill,
        className,
      )}
      data-status={status}
      data-overdue={overdue || undefined}
      {...props}
    >
      <span className={cn("size-2 shrink-0 rounded-pill", styles.dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
