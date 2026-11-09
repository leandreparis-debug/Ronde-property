import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/format";
import type { CurrentUser } from "@/server/auth/types";
import { USER_ROLE_LABELS } from "@/server/domain/enums";

import { AccountMenu } from "./account-menu";

/** Initials, name and role of the user, opening the account menu. */
export function UserBadge({
  user,
  compact = false,
}: {
  user: Pick<CurrentUser, "fullName" | "role">;
  compact?: boolean;
}) {
  return (
    <AccountMenu
      fullName={user.fullName}
      roleLabel={USER_ROLE_LABELS[user.role]}
      initials={initials(user.fullName)}
      compact={compact}
    />
  );
}

/** « Lecture seule » badge, always visible for the direction. */
export function ReadOnlyBadge({
  user,
  className,
}: {
  user: Pick<CurrentUser, "role">;
  className?: string;
}) {
  if (user.role !== "direction") return null;
  return (
    <Badge variant="neutral" className={className}>
      Lecture seule
    </Badge>
  );
}
