"use client";

import { X } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Sheet of the plan screen: bottom sheet on a tablet, side column from 1024 px (the plan stays
 * visible). It stays mounted while open, so a rotation of the tablet keeps what is typed.
 */
export function SheetPanel({
  title,
  subtitle,
  onClose,
  closeLabel,
  testId,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <aside
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex max-h-[60dvh] flex-col gap-4 overflow-y-auto rounded-t-xl border-t border-rule bg-paper p-4 shadow-raised",
        "lg:static lg:z-auto lg:max-h-none lg:w-96 lg:shrink-0 lg:rounded-xl lg:border lg:shadow-none",
        className,
      )}
      aria-labelledby={`${id}-title`}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="font-display text-title-sm text-ink">
            {title}
          </h3>
          {subtitle ? <p className="truncate text-ui text-ink-2">{subtitle}</p> : null}
        </div>
        <Button type="button" variant="ghost" onClick={onClose} aria-label={closeLabel}>
          <X className="size-5" aria-hidden="true" />
        </Button>
      </div>
      {children}
    </aside>
  );
}
