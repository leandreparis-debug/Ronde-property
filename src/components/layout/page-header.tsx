import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  /** Small uppercase text above the title (e.g. a site code). */
  eyebrow?: ReactNode;
  title: string;
  /** Actions shown on the right, wrapping under the title below 640 px. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Title block at the top of a page.
 */
export function PageHeader({ eyebrow, title, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 py-6 sm:flex-row sm:items-end sm:justify-between md:py-8",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <p className="label-caps text-ink-2">{eyebrow}</p> : null}
        <h1 className="font-display text-title text-ink">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
