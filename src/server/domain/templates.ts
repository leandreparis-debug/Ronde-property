import type { VisitType } from "./enums";

/**
 * Zone templates of the visits. Not stored in the database: the notes carry their own
 * zone_key and zone_label, so a template can evolve without touching past visits.
 */
export interface ZoneTemplate {
  key: string;
  label: string;
}

/** Identifier of a template: one per visit type for now. */
export type ZoneTemplateKey = "technical" | "meeting";

export interface VisitZoneTemplate {
  key: ZoneTemplateKey;
  /** Displayed name, e.g. « Insérer la trame visite technique ». */
  name: string;
  zones: readonly ZoneTemplate[];
}

/** Prefix of the keys of zones added by the user to a visit. */
export const CUSTOM_ZONE_PREFIX = "custom-";

/** Validation pattern of a zone key, mirrored by the database CHECK constraint. */
export const ZONE_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/;

/** Bounds of a zone label as typed by the user (the database accepts up to 120). */
export const ZONE_LABEL_MAX_LENGTH = 80;

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

// provisoire : trames par motif en phase 2
/** Provisional « réunion » template: agenda, discussion, decisions. */
export const MEETING_ZONES: readonly ZoneTemplate[] = [
  { key: "agenda", label: "Ordre du jour" },
  { key: "discussion", label: "Points abordés" },
  { key: "decisions", label: "Décisions et suites à donner" },
] as const;

export const ZONE_TEMPLATES: Record<ZoneTemplateKey, VisitZoneTemplate> = {
  technical: { key: "technical", name: "visite technique", zones: TECHNICAL_VISIT_ZONES },
  meeting: { key: "meeting", name: "réunion", zones: MEETING_ZONES },
};

/** Template applied to a visit of the given type (one template per type until phase 2). */
export function templateForVisitType(type: VisitType): VisitZoneTemplate {
  return ZONE_TEMPLATES[type];
}

/** Whether a zone key belongs to the given template (default: technical visit). */
export function isTemplateZone(key: string, template: ZoneTemplateKey = "technical"): boolean {
  return ZONE_TEMPLATES[template].zones.some((zone) => zone.key === key);
}

/** Label normalised for duplicate detection: trimmed, lowercase, without accents. */
export function normalizeZoneLabel(label: string): string {
  return label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Builds the key of a custom zone from a free label: `custom-{slug}` or, with a suffix,
 * `custom-{slug}-{suffix}` (the repository adds a short random suffix so two zones with the
 * same label, or a zone added again after a removal, never collide). Always matches
 * `ZONE_KEY_PATTERN`.
 */
export function customZoneKey(label: string, suffix = ""): string {
  const tail = suffix ? `-${suffix}` : "";
  const room = 64 - CUSTOM_ZONE_PREFIX.length - tail.length;
  const slug = normalizeZoneLabel(label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, room)
    .replace(/-+$/, "");
  return `${CUSTOM_ZONE_PREFIX}${slug || "zone"}${tail}`;
}
