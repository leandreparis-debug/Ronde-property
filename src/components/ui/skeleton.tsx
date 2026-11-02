import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Loading placeholder. Give it the size of the content it stands for.
 *
 * @example
 * <Skeleton className="h-5 w-40" />
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-sm bg-galet motion-reduce:animate-none", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
