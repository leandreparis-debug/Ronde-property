import { normalizeZoneLabel, ZONE_LABEL_MAX_LENGTH } from "@/server/domain/templates";

/** Messages shared by the server (repository) and the client (zone management dialog). */
export const REMOVE_NOT_EMPTY_MESSAGE = "Videz la zone avant de la retirer.";

/** Refusal to remove a zone that still has photos linked to it. */
export function removeHasPhotosMessage(count: number): string {
  return count === 1
    ? "Déplacez ou retirez d'abord la photo liée."
    : `Déplacez ou retirez d'abord les ${count} photos liées.`;
}

/** Refusal of an empty zone label. */
export const EMPTY_ZONE_LABEL_MESSAGE = "Le libellé de la zone est obligatoire.";
/** Refusal of a label already used by another zone of the visit. */
export const DUPLICATE_ZONE_LABEL_MESSAGE = "Une zone porte déjà ce libellé.";
/** Refusal of a label longer than `ZONE_LABEL_MAX_LENGTH`. */
export const LONG_ZONE_LABEL_MESSAGE = `${ZONE_LABEL_MAX_LENGTH} caractères maximum.`;

/** Zone label as stored: spaces collapsed and trimmed. */
export function cleanZoneLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

/**
 * Checks a zone label against the other zones of the visit, with the server rules (the client
 * refuses before queueing, the server checks again). Returns the message or `null`.
 */
export function zoneLabelError(
  label: string,
  siblings: readonly { id: string; zoneLabel: string }[],
  exceptId?: string,
): string | null {
  const trimmed = cleanZoneLabel(label);
  if (trimmed === "") return EMPTY_ZONE_LABEL_MESSAGE;
  if (trimmed.length > ZONE_LABEL_MAX_LENGTH) return LONG_ZONE_LABEL_MESSAGE;
  const wanted = normalizeZoneLabel(trimmed);
  if (siblings.some((s) => s.id !== exceptId && normalizeZoneLabel(s.zoneLabel) === wanted)) {
    return DUPLICATE_ZONE_LABEL_MESSAGE;
  }
  return null;
}
