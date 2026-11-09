import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Trail } from "@/components/brand/Trail";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { NewVisitButton } from "@/components/visits/new-visit-button";
import { VisitCard } from "@/components/visits/visit-card";
import { VisitFilters } from "@/components/visits/visit-filters";
import { cn } from "@/lib/cn";
import { requireUser } from "@/server/auth/session";
import {
  VISIT_REASONS,
  VISIT_STATUSES,
  type VisitReason,
  type VisitStatus,
} from "@/server/domain/enums";
import { listVisits } from "@/server/services/visits";

export const metadata: Metadata = {
  title: "Visites",
};

type RawParams = Record<string, string | string[] | undefined>;

function single(params: RawParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Visits list: « Mes visites » / « Toutes les visites », filters in the URL, paged cards. */
export default async function VisitsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const canCreate = user.role === "rt" || user.role === "admin";
  const requestedScope = single(params, "scope");
  const scope: "mine" | "all" =
    user.role === "direction" ? "all" : requestedScope === "all" ? "all" : "mine";

  const q = single(params, "q").slice(0, 200);
  const statusParam = single(params, "status");
  const status = VISIT_STATUSES.includes(statusParam as VisitStatus)
    ? (statusParam as VisitStatus)
    : undefined;
  const reasonParam = single(params, "reason");
  const reason = VISIT_REASONS.includes(reasonParam as VisitReason)
    ? (reasonParam as VisitReason)
    : undefined;
  const fromParam = single(params, "from");
  const toParam = single(params, "to");
  const from = ISO_DATE.test(fromParam) ? fromParam : undefined;
  const to = ISO_DATE.test(toParam) ? toParam : undefined;
  const periodError =
    from && to && from > to ? "La date de début est après la date de fin." : undefined;
  const page = Math.max(1, Number.parseInt(single(params, "page") || "1", 10) || 1);

  const result = await listVisits({
    scope,
    q,
    status,
    reason,
    from: periodError ? undefined : from,
    to: periodError ? undefined : to,
    page,
  });
  const hasFilters = Boolean(q || status || reason || from || to);

  const href = (target: number) => {
    const next = new URLSearchParams();
    if (scope === "all" && user.role !== "direction") next.set("scope", "all");
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (reason) next.set("reason", reason);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `/?${query}` : "/";
  };

  const tabs =
    user.role === "direction"
      ? [{ scope: "all", label: "Toutes les visites" }]
      : [
          { scope: "mine", label: "Mes visites" },
          { scope: "all", label: "Toutes les visites" },
        ];

  return (
    <>
      <PageHeader title="Visites" actions={canCreate ? <NewVisitButton /> : null} />
      <div className="flex flex-col gap-6">
        <nav aria-label="Périmètre" className="flex gap-2">
          {tabs.map((tab) => {
            const active = tab.scope === scope;
            const link = new URLSearchParams();
            if (tab.scope === "all") link.set("scope", "all");
            return (
              <Link
                key={tab.scope}
                href={link.toString() ? `/?${link.toString()}` : "/"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-pill border px-4 text-ui font-semibold",
                  active
                    ? "border-brand bg-brand text-on-brand"
                    : "border-rule bg-paper text-ink hover:bg-galet",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <Suspense fallback={null}>
          <VisitFilters
            value={{ q, status: status ?? "", reason: reason ?? "", from: fromParam, to: toParam }}
            periodError={periodError}
          />
        </Suspense>

        {result.items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              mood="asleep"
              title="Aucune visite ne correspond"
              description="Modifiez ou effacez les filtres pour élargir la recherche."
              action={
                <Button asChild variant="secondary">
                  <Link href={scope === "all" && user.role !== "direction" ? "/?scope=all" : "/"}>
                    Effacer les filtres
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              mood="asleep"
              illustration={<Trail width={280} />}
              title="Aucune visite pour l'instant"
              description="Vos visites apparaîtront ici, sur la tablette comme sur l'ordinateur."
              action={
                canCreate ? (
                  <Button asChild size="lg">
                    <Link href="/visites/nouvelle">Nouvelle visite</Link>
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Visites">
            {result.items.map((visit) => (
              <li key={visit.id}>
                <VisitCard visit={visit} />
              </li>
            ))}
          </ul>
        )}
        {result.total > 0 ? (
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            href={href}
            noun={["visite", "visites"]}
          />
        ) : null}
      </div>
    </>
  );
}
