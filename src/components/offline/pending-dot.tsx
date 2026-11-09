import { cn } from "@/lib/cn";

/**
 * Discreet « en attente » mark of an element not yet synchronised: a small brand dot with its
 * text for screen readers (and a visible label when `label` is set). Never a status colour.
 */
export function PendingDot({
  label = false,
  className,
}: {
  /** Show « En attente » next to the dot. */
  label?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-label text-ink-2", className)}
      data-testid="pending-dot"
      title="En attente de synchronisation"
    >
      <span className="size-2 shrink-0 rounded-pill bg-brand" aria-hidden="true" />
      {label ? (
        <span>En attente</span>
      ) : (
        <span className="sr-only">en attente de synchronisation</span>
      )}
    </span>
  );
}
