import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import type { CurrentUser } from "@/server/auth/types";
import { USER_ROLE_LABELS } from "@/server/domain/enums";

/** Initials, name and role of the user, linking to /compte. */
export function UserBadge({ user, compact = false }: { user: CurrentUser; compact?: boolean }) {
  return (
    <Link
      href="/compte"
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md text-ink hover:bg-craie",
        compact ? "px-1" : "px-2 py-2",
      )}
      aria-label={compact ? `Mon compte : ${user.fullName}` : undefined}
    >
      <span
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-ui font-bold text-brand-deep"
        aria-hidden="true"
      >
        {initials(user.fullName)}
      </span>
      {compact ? null : (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-ui font-semibold">{user.fullName}</span>
          <span className="truncate text-label text-ink-2">{USER_ROLE_LABELS[user.role]}</span>
        </span>
      )}
    </Link>
  );
}

/** « Lecture seule » badge, always visible for the direction. */
export function ReadOnlyBadge({ user, className }: { user: CurrentUser; className?: string }) {
  if (user.role !== "direction") return null;
  return (
    <Badge variant="neutral" className={className}>
      Lecture seule
    </Badge>
  );
}
