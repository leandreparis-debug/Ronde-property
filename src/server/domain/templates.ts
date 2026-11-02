/**
 * Zone template of a technical visit. Not stored in the database at step 2:
 * the notes carry their own zone_key and zone_label.
 */
export interface ZoneTemplate {
  key: string;
  label: string;
}

/** Prefix of the keys of zones added by the user to a visit. */
export const CUSTOM_ZONE_PREFIX = "custom-";

/** Validation pattern of a zone key, mirrored by the database CHECK constraint. */
export const ZONE_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/;

/** The nine zones of the « visite technique » template, in display order. */
export const TECHNICAL_VISIT_ZONES: readonly ZoneTemplate[] = [
  { key: "roof", label: "Toiture" },
  { key: "docks", label: "Quais" },
  { key: "sprinkler", label: "Sprinklage" },
  { key: "facades", label: "Façades et bardage" },
  { key: "smoke_extraction", label: "Désenfumage" },
  { key: "electrical", label: "Électricité et TGBT" },
  { key: "fences_access", label: "Clôtures et accès" },
  { key: "drainage", label: "Réseaux EU/EP" },
  { key: "fire_safety", label: "Sécurité incendie" },
] as const;

/** Whether a zone key belongs to the template (as opposed to a custom zone). */
export function isTemplateZone(key: string): boolean {
  return TECHNICAL_VISIT_ZONES.some((zone) => zone.key === key);
}

/** Builds the key of a custom zone from a free label (lowercase, ASCII, dashes). */
export function customZoneKey(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64 - CUSTOM_ZONE_PREFIX.length);
  return `${CUSTOM_ZONE_PREFIX}${slug || "zone"}`;
}
