import { z } from "zod";

/** Sections that can be left out (the cover is always printed). */
export const REPORT_SECTIONS = ["summary", "reserves", "notes", "plans", "annex"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  summary: "Synthèse",
  reserves: "Réserves",
  notes: "Notes par zone",
  plans: "Plans",
  annex: "Annexe photos",
};

export const PHOTOS_PER_PAGE = [2, 4, 6] as const;
export type PhotosPerPage = (typeof PHOTOS_PER_PAGE)[number];

export const REPORT_QUALITIES = ["standard", "light"] as const;
export type ReportQuality = (typeof REPORT_QUALITIES)[number];

export const REPORT_QUALITY_LABELS: Record<ReportQuality, string> = {
  standard: "Standard",
  light: "Légère",
};

/** Options of a report, chosen in the sheet and stored in `reports.options`. */
export const reportOptionsSchema = z.object({
  sections: z
    .array(z.enum(REPORT_SECTIONS))
    .max(REPORT_SECTIONS.length)
    .transform((values) => REPORT_SECTIONS.filter((section) => values.includes(section))),
  includeDoneReserves: z.boolean(),
  photosPerPage: z.union([z.literal(2), z.literal(4), z.literal(6)]),
  quality: z.enum(REPORT_QUALITIES),
  /** `null`: the cover photo of the visit (or the mascot when there is none). */
  coverPhotoId: z.uuid().nullable(),
});
export type ReportOptions = z.infer<typeof reportOptionsSchema>;

/** Defaults: every section, done reserves left out, 4 photos per page, standard quality. */
export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  sections: [...REPORT_SECTIONS],
  includeDoneReserves: false,
  photosPerPage: 4,
  quality: "standard",
  coverPhotoId: null,
};

/**
 * Options stored with an earlier report of the visit, or the defaults. Anything that no
 * longer validates (old format) falls back to the defaults.
 */
export function readReportOptions(value: unknown): ReportOptions {
  const parsed = reportOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_REPORT_OPTIONS;
}

/** Short summary for the history: « Synthèse, Réserves (+ levées), 4 photos/page, Légère ». */
export function summariseReportOptions(options: ReportOptions): string {
  const sections = options.sections.map((section) =>
    section === "reserves" && options.includeDoneReserves
      ? `${REPORT_SECTION_LABELS.reserves} (+ levées)`
      : REPORT_SECTION_LABELS[section],
  );
  return [
    sections.length > 0 ? sections.join(", ") : "Couverture seule",
    `${options.photosPerPage} photos/page`,
    REPORT_QUALITY_LABELS[options.quality],
  ].join(" · ");
}
