import { Logo } from "@/components/brand/Logo";
import type { CurrentUser } from "@/server/auth/types";

import { NavIcon } from "./nav-icon";
import { navItemsFor } from "./nav-items";
import { NavLink } from "./nav-link";
import { ReadOnlyBadge, UserBadge } from "./user-badge";

/**
 * Fixed 240 px side navigation, shown from 1024 px (PC, tablet in landscape).
 * Contains the logo, the main links (plus Administration for the admin) and the user.
 */
export function SideNav({ user }: { user: CurrentUser }) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-sidenav flex-col border-r border-rule bg-paper lg:flex"
      aria-label="Navigation principale"
    >
      <div className="flex h-20 items-center justify-between px-5">
        <Logo size="md" />
        <ReadOnlyBadge user={user} />
      </div>

      <nav className="flex flex-col gap-1 px-3" aria-label="Sections">
        {navItemsFor(user).map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            match={item.match}
            className="flex h-12 items-center gap-3 rounded-md px-3 text-ui font-semibold text-ink hover:bg-craie"
            activeClassName="bg-brand text-on-brand hover:bg-brand-deep"
          >
            <NavIcon icon={item.icon} className="size-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" aria-hidden="true" />

      <div className="border-t border-rule px-3 py-3">
        <UserBadge user={user} />
      </div>
    </aside>
  );
}
