import { ClipboardList, ListChecks } from "lucide-react";

import type { NavItem } from "@/lib/constants";

/** Icon of a navigation entry, hidden from assistive technologies (the label carries the meaning). */
export function NavIcon({ icon, className }: { icon: NavItem["icon"]; className?: string }) {
  const Icon = icon === "visits" ? ClipboardList : ListChecks;
  return <Icon className={className} aria-hidden="true" />;
}
