/** Displayed name of the application. */
export const APP_NAME = "RONDE";

/** Main entries of a visit, in display order (step 12 b: the plan first). */
export const VISIT_SCREENS = [
  { value: "plan", label: "Plan" },
  { value: "liste", label: "Liste" },
  { value: "rapport", label: "Rapport" },
] as const;

/** Sections of « Liste » (the former tabs of the visit, step 12 b). */
export const LIST_SECTIONS = [
  { value: "information", label: "Informations" },
  { value: "notes", label: "Notes" },
  { value: "reserves", label: "Réserves" },
  { value: "photos", label: "Photos" },
] as const;

/** Minimum size of an interactive target, in pixels (touch-first). */
export const MIN_TOUCH_TARGET = 44;

/** Width from which the side navigation replaces the bottom bar. */
export const SIDENAV_BREAKPOINT = 1024;
