/** Displayed name of the application. */
export const APP_NAME = "RONDE";

/** Main navigation entries, shared by the side navigation and the bottom bar. */
export const NAV_ITEMS = [
  { href: "/", label: "Mes visites", icon: "visits" },
  { href: "/reserves", label: "Mes réserves", icon: "reserves" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

/** Tabs of a visit, in display order (used from step 5). */
export const VISIT_TABS = [
  { value: "information", label: "Informations" },
  { value: "notes", label: "Notes" },
  { value: "reserves", label: "Réserves" },
  { value: "photos", label: "Photos" },
  { value: "plans", label: "Plans" },
  { value: "report", label: "Rapport" },
] as const;

/** Minimum size of an interactive target, in pixels (touch-first). */
export const MIN_TOUCH_TARGET = 44;

/** Width from which the side navigation replaces the bottom bar. */
export const SIDENAV_BREAKPOINT = 1024;
