/** URL parameters opening the reserve sheet from another tab (Notes « + Réserve », marker sheet). */
export const NEW_RESERVE_PARAM = "nouvelle";
export const NEW_RESERVE_PHOTO_PARAM = "photo-defaut";
export const NEW_RESERVE_MARKER_PARAM = "depuis-repere";
/** URL parameter of the reserve placement mode in the Plans tab. */
export const PLACE_RESERVE_PARAM = "placer";

/** Link opening the Reserves tab with the creation sheet (zone, photo, marker prefilled). */
export function newReserveHref(options: {
  zoneKey?: string | null;
  photoId?: string | null;
  markerId?: string | null;
}): string {
  const params = new URLSearchParams({ onglet: "reserves" });
  params.set(NEW_RESERVE_PARAM, options.zoneKey ?? "1");
  if (options.photoId) params.set(NEW_RESERVE_PHOTO_PARAM, options.photoId);
  if (options.markerId) params.set(NEW_RESERVE_MARKER_PARAM, options.markerId);
  return `?${params.toString()}`;
}

/** Detail page of a reserve. */
export function reserveHref(visitId: string, reserveId: string): string {
  return `/visites/${visitId}/reserves/${reserveId}`;
}

/** Plans tab in placement mode for a reserve (from its detail page). */
export function placeOnPlanHref(visitId: string, reserveId: string): string {
  return `/visites/${visitId}?onglet=plans&${PLACE_RESERVE_PARAM}=${reserveId}`;
}
