import type { CurrentUser } from "@/server/auth/types";

/** A main navigation entry. `match` is the path prefix that marks it current. */
export interface AppNavItem {
  href: string;
  match: string;
  label: string;
  icon: "visits" | "reserves" | "sites" | "admin";
}

const BASE_ITEMS: AppNavItem[] = [
  { href: "/", match: "/", label: "Visites", icon: "visits" },
  { href: "/reserves", match: "/reserves", label: "Réserves", icon: "reserves" },
  { href: "/sites", match: "/sites", label: "Sites", icon: "sites" },
];

const ADMIN_ITEM: AppNavItem = {
  href: "/admin/comptes",
  match: "/admin",
  label: "Administration",
  icon: "admin",
};

/** Navigation entries for a user: the admin gets « Administration ». */
export function navItemsFor(user: Pick<CurrentUser, "role">): AppNavItem[] {
  return user.role === "admin" ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;
}
