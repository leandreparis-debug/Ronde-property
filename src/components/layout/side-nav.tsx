import { Logo } from "@/components/brand/Logo";
import { NAV_ITEMS } from "@/lib/constants";

import { NavIcon } from "./nav-icon";
import { NavLink } from "./nav-link";

/**
 * Fixed 240 px side navigation, shown from 1024 px (PC, tablet in landscape).
 * Contains the logo, the main links, and a placeholder account area until step 3.
 */
export function SideNav() {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-sidenav flex-col border-r border-rule bg-paper lg:flex"
      aria-label="Navigation principale"
    >
      <div className="flex h-20 items-center px-5">
        <Logo size="md" />
      </div>

      <nav className="flex flex-col gap-1 px-3" aria-label="Sections">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            className="flex h-12 items-center gap-3 rounded-md px-3 text-ui font-semibold text-ink hover:bg-craie"
            activeClassName="bg-brand text-on-brand hover:bg-brand-deep"
          >
            <NavIcon icon={item.icon} className="size-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" aria-hidden="true" />

      <div className="flex items-center gap-3 border-t border-rule px-5 py-4">
        <span
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-galet text-ui font-bold text-ink"
          aria-hidden="true"
        >
          RT
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ui font-semibold text-ink">Compte</span>
          <span className="truncate text-label text-ink-2">Connexion à venir</span>
        </div>
      </div>
    </aside>
  );
}
