import "server-only";

import { requireUserForAction } from "@/server/auth/session";
import type { UserRef } from "@/server/db/context";
import { withUser } from "@/server/db/context";
import type { Site } from "@/server/domain";
import type { VisitReason, VisitStatus } from "@/server/domain/enums";
import { createSiteRepository, type SiteSearchParams } from "@/server/repositories/site-repository";

/** Visit of a site, as shown on the site page (read-only at this step). */
export interface SiteVisitSummary {
  id: string;
  visitDate: string;
  title: string;
  reason: VisitReason;
  status: VisitStatus;
  openReservesCount: number;
  overdueReservesCount: number;
}

/** Searches sites as the current user. */
export async function searchSites(params: SiteSearchParams) {
  const user = await requireUserForAction();
  return createSiteRepository(user).search(params);
}

/** Categories of the active sites, as the current user. */
export async function listSiteCategories(): Promise<string[]> {
  const user = await requireUserForAction();
  return createSiteRepository(user).listCategories();
}

/** A site and its visits (newest first), or null when the code is unknown. */
export async function getSiteWithVisits(
  code: string,
): Promise<{ site: Site; visits: SiteVisitSummary[] } | null> {
  const user = await requireUserForAction();
  const site = await createSiteRepository(user).getByCode(code);
  if (!site) return null;
  const visits = await listSiteVisits(user, site.id);
  return { site, visits };
}

async function listSiteVisits(user: UserRef, siteId: string): Promise<SiteVisitSummary[]> {
  const rows = await withUser(user, (trx) =>
    trx
      .selectFrom("visit_summaries")
      .select([
        "id",
        "visit_date",
        "title",
        "reason",
        "status",
        "open_reserves_count",
        "overdue_reserves_count",
      ])
      .where("site_id", "=", siteId)
      .orderBy("visit_date", "desc")
      .execute(),
  );
  return rows.flatMap((row) =>
    row.id && row.visit_date && row.title && row.reason && row.status
      ? [
          {
            id: row.id,
            visitDate: row.visit_date,
            title: row.title,
            reason: row.reason,
            status: row.status,
            openReservesCount: row.open_reserves_count ?? 0,
            overdueReservesCount: row.overdue_reserves_count ?? 0,
          },
        ]
      : [],
  );
}
