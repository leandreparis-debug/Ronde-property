import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { SiteCard } from "@/components/sites/site-card";
import { SiteSearchForm } from "@/components/sites/site-search-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/server/auth/session";
import { listSiteCategories, searchSites } from "@/server/services/sites";

export const metadata: Metadata = {
  title: "Sites",
};

type RawParams = Record<string, string | string[] | undefined>;

function single(params: RawParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Site repository search: name, code or city, accent- and case-insensitive. */
export default async function SitesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireUser();
  const params = await searchParams;
  const q = single(params, "q").slice(0, 200);
  const category = single(params, "category");
  const includeInactive = single(params, "inactive") === "1";
  const page = Math.max(1, Number.parseInt(single(params, "page") || "1", 10) || 1);

  const [result, categories] = await Promise.all([
    searchSites({ q, category: category || undefined, includeInactive, page }),
    listSiteCategories(),
  ]);

  const href = (target: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (category) next.set("category", category);
    if (includeInactive) next.set("inactive", "1");
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `/sites?${query}` : "/sites";
  };

  return (
    <>
      <PageHeader eyebrow="Référentiel VIGIE" title="Sites" />
      <div className="flex flex-col gap-6">
        <Suspense fallback={null}>
          <SiteSearchForm
            q={q}
            category={category}
            includeInactive={includeInactive}
            categories={categories}
          />
        </Suspense>
        {result.items.length === 0 ? (
          <EmptyState
            mood="asleep"
            title={q ? `Aucun site ne correspond à « ${q} »` : "Aucun site"}
            description="Vérifiez l'orthographe ou élargissez les filtres. Le référentiel est mis à jour par l'administrateur."
          />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Sites">
            {result.items.map((site) => (
              <li key={site.id}>
                <SiteCard site={site} />
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          href={href}
          noun={["site", "sites"]}
        />
      </div>
    </>
  );
}
