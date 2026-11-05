import { z } from "zod";

/** Periods offered by /admin/avis. */
export const FEEDBACK_PERIODS = [
  { key: "7", label: "7 derniers jours", days: 7 },
  { key: "30", label: "30 derniers jours", days: 30 },
  { key: "90", label: "3 derniers mois", days: 90 },
  { key: "all", label: "Depuis le début", days: null },
] as const;

export type FeedbackPeriod = (typeof FEEDBACK_PERIODS)[number]["key"];

/** Filters of /admin/avis, read from and written to the URL. */
export interface FeedbackFilters {
  /** Maximum rating (« 2 » = ratings 1 and 2). */
  maxRating: number | null;
  period: FeedbackPeriod;
  /** Only the feedback that says what blocks. */
  blocksOnly: boolean;
  /** Part of the page path (« /visites », « plans »). */
  page: string | null;
}

export const DEFAULT_FEEDBACK_FILTERS: FeedbackFilters = {
  maxRating: null,
  period: "all",
  blocksOnly: false,
  page: null,
};

const querySchema = z.object({
  note: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  periode: z.enum(["7", "30", "90", "all"]).optional().catch(undefined),
  bloque: z.literal("1").optional().catch(undefined),
  page: z.string().trim().max(100).optional().catch(undefined),
});

type RawParams = Record<string, string | string[] | undefined>;

function single(params: RawParams, key: string): string | undefined {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw : undefined;
}

/** Reads the filters from the query; anything invalid falls back to its default. */
export function parseFeedbackFilters(params: RawParams): FeedbackFilters {
  const parsed = querySchema.parse({
    note: single(params, "note"),
    periode: single(params, "periode"),
    bloque: single(params, "bloque"),
    page: single(params, "page"),
  });
  return {
    maxRating: parsed.note ?? null,
    period: parsed.periode ?? "all",
    blocksOnly: parsed.bloque === "1",
    page: parsed.page ? parsed.page : null,
  };
}

/** Query string of the filters (without the defaults), for links and the CSV export. */
export function feedbackFiltersQuery(filters: FeedbackFilters): string {
  const query = new URLSearchParams();
  if (filters.maxRating !== null) query.set("note", String(filters.maxRating));
  if (filters.period !== "all") query.set("periode", filters.period);
  if (filters.blocksOnly) query.set("bloque", "1");
  if (filters.page) query.set("page", filters.page);
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Start of the period, or null for « Depuis le début ». */
export function periodStart(period: FeedbackPeriod, now: Date): Date | null {
  const days = FEEDBACK_PERIODS.find((p) => p.key === period)?.days ?? null;
  return days === null ? null : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
