import { ClipboardList, ListChecks, ShieldCheck } from "lucide-react";

import type { AppNavItem } from "./nav-items";

const ICONS = { visits: ClipboardList, reserves: ListChecks, admin: ShieldCheck } as const;

/** Icon of a navigation entry, hidden from assistive technologies (the label carries the meaning). */
export function NavIcon({ icon, className }: { icon: AppNavItem["icon"]; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} aria-hidden="true" />;
}
