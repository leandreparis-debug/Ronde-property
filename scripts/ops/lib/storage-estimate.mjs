/**
 * Storage estimate of RONDE (docs/go-live.md, line 10). Defaults measured at step 10: photos of
 * 320 KB (1 600 px) plus a 40 KB thumbnail, 40 photos per visit, a report of about 12 MB in
 * « Standard » quality (generated 1.5 times per visit on average: draft then final).
 */
export const STORAGE_DEFAULTS = {
  photoKb: 320,
  thumbKb: 40,
  photosPerVisit: 40,
  reportMb: 12,
  reportsPerVisit: 1.5,
  /** Plans: a few PDF and their page images, per site, imported once. */
  planMbPerSite: 15,
};

const MB = 1024;

/**
 * Monthly and yearly storage (in GB) for `rts` technical managers doing `visitsPerRtPerMonth`
 * visits each, on `sites` sites with plans.
 */
export function estimateStorage({
  rts,
  visitsPerRtPerMonth,
  sites = 0,
  months = 12,
  ...overrides
}) {
  if (![rts, visitsPerRtPerMonth, sites, months].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error("Les nombres doivent être positifs.");
  }
  const p = { ...STORAGE_DEFAULTS, ...overrides };
  const visitsPerMonth = rts * visitsPerRtPerMonth;
  const photosMb = (visitsPerMonth * p.photosPerVisit * (p.photoKb + p.thumbKb)) / MB;
  const reportsMb = visitsPerMonth * p.reportsPerVisit * p.reportMb;
  const perMonthGb = (photosMb + reportsMb) / MB;
  const plansGb = (sites * p.planMbPerSite) / MB;
  const round = (n) => Math.round(n * 10) / 10;
  return {
    visitsPerMonth,
    photosGbPerMonth: round(photosMb / MB),
    reportsGbPerMonth: round(reportsMb / MB),
    perMonthGb: round(perMonthGb),
    plansGb: round(plansGb),
    totalGb: round(perMonthGb * months + plansGb),
    months,
  };
}
