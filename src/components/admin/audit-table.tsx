import { ChevronDown } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { type AuditFilters, type AuditPage, auditActionLabel } from "@/server/services/audit-log";

function pageHref(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.actorId) params.set("actor", filters.actorId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/journal?${query}` : "/admin/journal";
}

/** Filters (GET form), paged entries with expandable details, newest first. */
export function AuditTable({ data, filters }: { data: AuditPage; filters: AuditFilters }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4 md:p-5">
        <form
          method="get"
          className="grid grid-cols-1 gap-4 md:grid-cols-4"
          aria-label="Filtres du journal"
        >
          <Field id="filter-action" label="Action">
            {(control) => (
              <Select {...control} name="action" defaultValue={filters.action ?? ""}>
                <option value="">Toutes</option>
                {data.actions.map((action) => (
                  <option key={action} value={action}>
                    {auditActionLabel(action)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="filter-actor" label="Acteur">
            {(control) => (
              <Select {...control} name="actor" defaultValue={filters.actorId ?? ""}>
                <option value="">Tous</option>
                {data.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="filter-from" label="Du">
            {(control) => (
              <Input {...control} name="from" type="date" defaultValue={filters.from ?? ""} />
            )}
          </Field>
          <Field id="filter-to" label="Au">
            {(control) => (
              <Input {...control} name="to" type="date" defaultValue={filters.to ?? ""} />
            )}
          </Field>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <Button type="submit">Filtrer</Button>
            <Button asChild variant="ghost">
              <Link href="/admin/journal">Réinitialiser</Link>
            </Button>
          </div>
        </form>
      </Card>

      {data.entries.length === 0 ? (
        <EmptyState
          title="Aucune entrée"
          description="Aucun événement ne correspond à ces filtres."
        />
      ) : (
        <Card>
          <ol className="divide-y divide-rule">
            {data.entries.map((entry) => (
              <li
                key={entry.id}
                className="px-4 py-3 md:px-5"
                data-testid="audit-entry"
                data-action={entry.action}
              >
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-1 md:flex-row md:items-center md:gap-4">
                    <span className="w-40 shrink-0 text-ui text-ink-2">
                      {formatDateTime(entry.occurredAt)}
                    </span>
                    <span className="w-44 shrink-0 truncate text-ui font-semibold">
                      {entry.actorName ?? "Système"}
                    </span>
                    <span className="flex-1">
                      <Badge variant="brand">{auditActionLabel(entry.action)}</Badge>
                    </span>
                    <span className="text-ui text-ink-2">
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                    </span>
                    <ChevronDown
                      className="hidden size-5 shrink-0 text-ink-2 transition-transform group-open:rotate-180 md:block"
                      aria-hidden="true"
                    />
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-md bg-craie p-3 text-label tracking-normal text-ink-2 normal-case">
                    {JSON.stringify(
                      { action: entry.action, entity_id: entry.entityId, ...entry.details },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
        <p className="text-ui text-ink-2">
          Page {data.page} sur {data.pageCount} · {data.total} entrées
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Button asChild variant="secondary">
              <Link href={pageHref(filters, data.page - 1)}>Précédente</Link>
            </Button>
          ) : null}
          {data.page < data.pageCount ? (
            <Button asChild variant="secondary">
              <Link href={pageHref(filters, data.page + 1)}>Suivante</Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
