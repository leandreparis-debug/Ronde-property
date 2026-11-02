/** Locale and time zone used for every displayed date. */
export const LOCALE = "fr-FR";
export const TIME_ZONE = "Europe/Paris";

/** Placeholder shown for a missing or invalid value. */
export const EMPTY_VALUE = "—";

/** Accepted inputs: a Date, an ISO string, or a timestamp. */
export type DateInput = Date | string | number | null | undefined;

/**
 * Date styles:
 * - `short`: 15/12/2026
 * - `medium`: 15 déc. 2026
 * - `long`: 15 décembre 2026
 * - `full`: mardi 15 décembre 2026
 */
export type DateStyle = "short" | "medium" | "long" | "full";

const DATE_FORMATS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: "2-digit", month: "2-digit", year: "numeric" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  full: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
};

/** Converts any supported input to a valid Date, or `null`. Never throws. */
export function toValidDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a date in French, Paris time. Returns « — » for a null or invalid value.
 *
 * @example
 * formatDate("2026-12-15T10:00:00Z")          // "15/12/2026"
 * formatDate("2026-12-15T10:00:00Z", "long")  // "15 décembre 2026"
 */
export function formatDate(input: DateInput, style: DateStyle = "short"): string {
  const date = toValidDate(input);
  if (!date) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(LOCALE, { ...DATE_FORMATS[style], timeZone: TIME_ZONE }).format(
    date,
  );
}

/**
 * Formats a date and time in French, Paris time (24-hour clock).
 * Returns « — » for a null or invalid value.
 *
 * @example
 * formatDateTime("2026-07-01T12:30:00Z")  // "01/07/2026 14:30"
 */
export function formatDateTime(input: DateInput, style: DateStyle = "short"): string {
  const date = toValidDate(input);
  if (!date) return EMPTY_VALUE;
  const day = formatDate(date, style);
  const time = new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(date);
  return `${day} ${time}`;
}

/**
 * Initials of a full name, two letters maximum (« Alice Fictive » → « AF »).
 */
export function initials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return `${first}${last}`.toUpperCase() || "?";
}

/** Integer-rounded number in fr-FR (« 12 500 »), or « — » when null. */
export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

/** Surface in square metres (« 12 500 m² »), or « — ». */
export function formatSurface(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  return `${formatNumber(value, 0)} m²`;
}
