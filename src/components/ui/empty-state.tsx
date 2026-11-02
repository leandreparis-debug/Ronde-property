import { type ReactNode, useId } from "react";

import { Galet, type GaletMood } from "@/components/brand/Galet";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Mood of the mascot. `asleep` by default for empty lists. */
  mood?: GaletMood;
  /** Optional call to action, e.g. a <Button>. */
  action?: ReactNode;
  /** Optional decorative illustration (e.g. <Trail>) placed above the mascot. */
  illustration?: ReactNode;
  className?: string;
}

/**
 * Centred message for lists with no items yet, errors or offline screens.
 *
 * @example
 * <EmptyState title="Aucune visite pour l'instant" description="…" />
 */
export function EmptyState({
  title,
  description,
  mood = "asleep",
  action,
  illustration,
  className,
}: EmptyStateProps) {
  const titleId = useId();
  return (
    <section
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-4 py-12 text-center",
        className,
      )}
      aria-labelledby={titleId}
    >
      {illustration ? <div className="mb-2">{illustration}</div> : null}
      <Galet mood={mood} size={88} blink={mood === "neutral" || mood === "attentive"} />
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 id={titleId} className="font-display text-title-sm text-ink">
          {title}
        </h2>
        {description ? <p className="text-body text-ink-2">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
