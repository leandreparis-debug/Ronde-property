import { Logo } from "@/components/brand/Logo";
import { SyncIndicator } from "@/components/offline/sync-indicator";
import type { CurrentUser } from "@/server/auth/types";

import { ReadOnlyBadge, UserBadge } from "./user-badge";

/** Top bar with the logo and the user, shown below 1024 px in place of the side navigation. */
export function TopBar({ user }: { user: Pick<CurrentUser, "fullName" | "role"> }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-rule bg-paper px-4 md:px-6 lg:hidden">
      <Logo size="sm" />
      <div className="flex items-center gap-2">
        <ReadOnlyBadge user={user} />
        <SyncIndicator compact />
        <UserBadge user={user} compact />
      </div>
    </header>
  );
}
