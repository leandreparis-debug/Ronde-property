import type { CurrentUser } from "@/server/auth/types";

import { NavIcon } from "./nav-icon";
import { navItemsFor } from "./nav-items";
import { NavLink } from "./nav-link";

/**
 * Bottom navigation bar for tablets in portrait (below 1024 px).
 * 56 px high plus the device safe area; every entry has an icon and a label.
 */
export function BottomNav({ user }: { user: CurrentUser }) {
  const items = navItemsFor(user);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper safe-bottom lg:hidden"
      aria-label="Navigation principale"
    >
      <ul
        className="grid h-bottomnav"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.href} className="flex">
            <NavLink
              href={item.href}
              match={item.match}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-label font-semibold text-ink-2 hover:text-ink"
              activeClassName="text-brand-deep hover:text-brand-deep"
            >
              <NavIcon icon={item.icon} className="size-6" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
