import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex h-7 items-center gap-1 rounded-pill px-2.5 text-ui font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-galet text-ink",
        brand: "bg-brand-soft text-brand-deep",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/**
 * Small pill for counters and tags. Neutral by default, brand for emphasis.
 * Never used for statuses: see <StatusPill>.
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
