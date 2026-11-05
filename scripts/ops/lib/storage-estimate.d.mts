/** Types of scripts/ops/lib/storage-estimate.mjs (used by the tests). */
export const STORAGE_DEFAULTS: Record<string, number>;
export function estimateStorage(input: {
  rts: number;
  visitsPerRtPerMonth: number;
  sites?: number;
  months?: number;
  [override: string]: number | undefined;
}): {
  visitsPerMonth: number;
  photosGbPerMonth: number;
  reportsGbPerMonth: number;
  perMonthGb: number;
  plansGb: number;
  totalGb: number;
  months: number;
};
