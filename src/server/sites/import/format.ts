import { z } from "zod";

import { type ImportedSiteRow, SITE_FIELDS, type SiteField } from "./types";

/*
 * Column aliases of the VIGIE export, matched without case, accents, spaces or punctuation.
 * Adjust this constant once the real headers are known (step 5).
 */
export const FIELD_ALIASES: Record<SiteField, readonly string[]> = {
  warehouse_code: [
    "Code entrepôt",
    "Code entrepot",
    "Code site",
    "Code",
    "warehouse_code",
    "Code VIGIE",
  ],
  name: ["Nom", "Nom du site", "Nom entrepôt", "Nom de l'entrepôt", "Site", "name", "Libellé"],
  address: ["Adresse", "Adresse postale", "address", "Rue"],
  postal_code: ["Code postal", "CP", "postal_code", "Code Postal"],
  city: ["Ville", "Commune", "city"],
  surface_m2: [
    "Surface",
    "Surface (m²)",
    "Surface m2",
    "Surface m²",
    "SHON",
    "surface_m2",
    "Surface totale",
  ],
  category: ["Catégorie", "Categorie", "Type", "Typologie", "category"],
  latitude: ["Latitude", "Lat", "latitude"],
  longitude: ["Longitude", "Lon", "Lng", "Long", "longitude"],
  is_active: ["Actif", "Statut", "Active", "is_active", "État", "Etat"],
};

/** Fields the file must provide. */
export const REQUIRED_FIELDS: readonly SiteField[] = ["warehouse_code", "name"];

/** Lowercase, accents removed, letters and digits only: « Code entrepôt » → « codeentrepot ». */
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const ALIAS_INDEX = new Map<string, SiteField>();
for (const field of SITE_FIELDS) {
  for (const alias of FIELD_ALIASES[field]) {
    ALIAS_INDEX.set(normalizeHeader(alias), field);
  }
}

export interface HeaderMapping {
  recognized: Array<{ header: string; field: SiteField; index: number }>;
  ignored: string[];
  missingRequired: SiteField[];
}

/**
 * Maps the file headers to site fields. The first header matching a field wins; later
 * duplicates are ignored. Unknown headers are listed, never an error.
 */
export function mapHeaders(headers: string[]): HeaderMapping {
  const recognized: HeaderMapping["recognized"] = [];
  const ignored: string[] = [];
  const taken = new Set<SiteField>();
  headers.forEach((header, index) => {
    const field = ALIAS_INDEX.get(normalizeHeader(header));
    if (field && !taken.has(field)) {
      taken.add(field);
      recognized.push({ header, field, index });
    } else {
      ignored.push(header);
    }
  });
  const missingRequired = REQUIRED_FIELDS.filter((field) => !taken.has(field));
  return { recognized, ignored, missingRequired };
}

/** Trimmed text, or `null` when empty. Values starting with = + - @ are kept as-is. */
export function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/ /g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parses a French (« 12 500,50 ») or international (« 12500.50 ») number.
 * Returns `null` for an empty cell and `undefined` when the text is not a number.
 */
export function parseNumber(value: string | null | undefined): number | null | undefined {
  const text = cleanText(value);
  if (text === null) return null;
  let compact = text.replace(/[\s ]/g, "").replace(/m²|m2/gi, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    compact =
      lastComma > lastDot
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
  } else if (lastComma >= 0) {
    compact = compact.replace(",", ".");
  }
  if (!/^[-+]?\d+(\.\d+)?$/.test(compact)) return undefined;
  const parsed = Number(compact);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const TRUE_VALUES = new Set([
  "oui",
  "o",
  "1",
  "true",
  "vrai",
  "actif",
  "active",
  "x",
  "yes",
  "y",
  "ouvert",
]);
const FALSE_VALUES = new Set([
  "non",
  "n",
  "0",
  "false",
  "faux",
  "inactif",
  "inactive",
  "no",
  "ferme",
  "fermé",
  "clos",
]);

/** Parses oui/non, 1/0, actif/inactif… `null` when empty, `undefined` when unknown. */
export function parseBoolean(value: string | null | undefined): boolean | null | undefined {
  const text = cleanText(value);
  if (text === null) return null;
  const key = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (TRUE_VALUES.has(key)) return true;
  if (FALSE_VALUES.has(key)) return false;
  return undefined;
}

/** Uppercase trimmed code; validity is checked by the row schema. */
export function normalizeWarehouseCode(value: string | null | undefined): string | null {
  const text = cleanText(value);
  return text === null ? null : text.toUpperCase().replace(/\s+/g, "");
}

/** Restores the leading zero lost by Excel (« 1000 » → « 01000 »); other values pass through. */
export function normalizePostalCode(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (text === null) return null;
  const digits = text.replace(/\s/g, "");
  if (/^\d{4}$/.test(digits)) return `0${digits}`;
  return digits;
}

/** Validation of a normalised row, with French messages. */
export const siteRowSchema = z.object({
  warehouseCode: z
    .string({ message: "Code entrepôt manquant." })
    .regex(
      /^[A-Z0-9_-]{1,32}$/,
      "Code entrepôt invalide (lettres, chiffres, _ et -, 32 caractères max).",
    ),
  name: z
    .string({ message: "Nom manquant." })
    .min(1, "Nom manquant.")
    .max(200, "Nom trop long (200 caractères max)."),
  address: z.string().max(500, "Adresse trop longue.").nullable(),
  postalCode: z
    .string()
    .regex(/^\d{5}$/, "Code postal invalide (5 chiffres attendus).")
    .nullable(),
  city: z.string().max(200, "Ville trop longue.").nullable(),
  surfaceM2: z.number({ message: "Surface non numérique." }).min(0, "Surface négative.").nullable(),
  category: z.string().max(200, "Catégorie trop longue.").nullable(),
  latitude: z
    .number({ message: "Latitude non numérique." })
    .min(-90, "Latitude hors bornes.")
    .max(90, "Latitude hors bornes.")
    .nullable(),
  longitude: z
    .number({ message: "Longitude non numérique." })
    .min(-180, "Longitude hors bornes.")
    .max(180, "Longitude hors bornes.")
    .nullable(),
  isActive: z.boolean({ message: "Valeur Actif inconnue (oui/non attendu)." }).nullable(),
});

/** Raw cell values of a line, keyed by field. */
export type RawRow = Partial<Record<SiteField, string | null>>;

/**
 * Normalises and validates one line. Returns the row, or the list of error messages.
 */
export function normalizeRow(
  line: number,
  raw: RawRow,
): { row: ImportedSiteRow } | { errors: string[] } {
  const candidate = {
    warehouseCode: normalizeWarehouseCode(raw.warehouse_code) ?? undefined,
    name: cleanText(raw.name) ?? undefined,
    address: cleanText(raw.address),
    postalCode: normalizePostalCode(raw.postal_code),
    city: cleanText(raw.city),
    surfaceM2: parseNumber(raw.surface_m2),
    category: cleanText(raw.category),
    latitude: parseNumber(raw.latitude),
    longitude: parseNumber(raw.longitude),
    isActive: parseBoolean(raw.is_active),
  };
  const result = siteRowSchema.safeParse(candidate);
  if (!result.success) {
    const messages = [...new Set(result.error.issues.map((issue) => issue.message))];
    return { errors: messages };
  }
  return { row: { line, ...result.data } };
}
