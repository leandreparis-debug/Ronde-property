import { Download } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { FeedbackRow } from "@/lib/feedback/csv";
import { FEEDBACK_PERIODS, type FeedbackFilters, feedbackFiltersQuery } from "@/lib/feedback/list";
import { RATING_LABELS } from "@/lib/feedback/schema";
import { formatDateTime } from "@/lib/format";
import type { FeedbackSummary } from "@/server/services/feedback";

/** Feedback of the pilot for the admin: filters (GET form), summary, list and CSV export. */
export function FeedbackList({
  rows,
  summary,
  filters,
}: {
  rows: FeedbackRow[];
  summary: FeedbackSummary;
  filters: FeedbackFilters;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4 md:p-5">
        <form
          method="get"
          className="grid grid-cols-1 gap-4 md:grid-cols-4"
          aria-label="Filtres des avis"
        >
          <Field id="filter-note" label="Note">
            {(control) => (
              <Select {...control} name="note" defaultValue={filters.maxRating?.toString() ?? ""}>
                <option value="">Toutes</option>
                <option value="1">1 seulement</option>
                <option value="2">2 ou moins</option>
                <option value="3">3 ou moins</option>
                <option value="4">4 ou moins</option>
              </Select>
            )}
          </Field>
          <Field id="filter-periode" label="Période">
            {(control) => (
              <Select {...control} name="periode" defaultValue={filters.period}>
                {FEEDBACK_PERIODS.map((period) => (
                  <option key={period.key} value={period.key}>
                    {period.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="filter-page" label="Page contient">
            {(control) => (
              <Input
                {...control}
                name="page"
                defaultValue={filters.page ?? ""}
                placeholder="/visites, plans…"
              />
            )}
          </Field>
          <label className="flex min-h-11 items-center gap-3 self-end text-ui font-semibold">
            <input
              type="checkbox"
              name="bloque"
              value="1"
              defaultChecked={filters.blocksOnly}
              className="size-5 accent-brand"
            />
            Avec « Ce qui bloque »
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <Button type="submit">Filtrer</Button>
            <Button asChild variant="ghost">
              <Link href="/admin/avis">Réinitialiser</Link>
            </Button>
            <Button asChild variant="secondary" className="md:ml-auto">
              <a
                href={`/admin/avis/export${feedbackFiltersQuery(filters)}`}
                download
                data-testid="feedback-export"
              >
                <Download className="size-4" aria-hidden="true" />
                Exporter en CSV
              </a>
            </Button>
          </div>
        </form>
      </Card>

      <Card
        className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 md:p-5"
        data-testid="feedback-summary"
      >
        <p className="text-ui">
          <span className="font-display text-title-sm font-bold">{summary.count}</span> avis
        </p>
        <p className="text-ui">
          Note moyenne :{" "}
          <span className="font-semibold">
            {summary.averageRating === null
              ? "—"
              : `${summary.averageRating.toLocaleString("fr-FR")} / 5`}
          </span>
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Répartition des notes">
          {([1, 2, 3, 4, 5] as const).map((rating) => (
            <li key={rating}>
              <Badge>
                {rating} : {summary.byRating[rating]}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Aucun avis" description="Aucun avis ne correspond à ces filtres." />
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className="flex flex-col gap-3 p-4 md:p-5" data-testid="feedback-item">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Badge variant="brand">
                    Note {row.rating}/5 · {RATING_LABELS[row.rating]}
                  </Badge>
                  <span className="text-ui font-semibold">{row.authorName}</span>
                  <span className="text-ui text-ink-2">{row.authorRole}</span>
                  <span className="text-ui text-ink-2 md:ml-auto">
                    {formatDateTime(row.createdAt)}
                  </span>
                </div>
                {row.works ? (
                  <div>
                    <p className="label-caps text-ink-2">Ce qui marche</p>
                    <p className="text-body whitespace-pre-line">{row.works}</p>
                  </div>
                ) : null}
                {row.blocks ? (
                  <div>
                    <p className="label-caps text-ink-2">Ce qui bloque</p>
                    <p className="text-body whitespace-pre-line">{row.blocks}</p>
                  </div>
                ) : null}
                <p className="text-ui break-all text-ink-2">
                  Page {row.pagePath}
                  {row.viewport ? ` · écran ${row.viewport}` : ""} · version {row.appVersion}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
