"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { VISIT_REASONS, VISIT_STATUSES } from "@/server/domain/enums";
import { VISIT_REASON_LABELS, VISIT_STATUS_LABELS } from "@/server/domain/labels";

export interface VisitFiltersValue {
  q: string;
  status: string;
  reason: string;
  from: string;
  to: string;
}

const DEBOUNCE_MS = 250;

/** Search, status, reason and period filters, reflected in the URL; collapsible below 768 px. */
export function VisitFilters({
  value,
  periodError,
}: {
  value: VisitFiltersValue;
  periodError?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(Boolean(value.status || value.reason || value.from || value.to));
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function navigate(next: VisitFiltersValue) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "status", "reason", "from", "to"] as const) {
      const item = next[key].trim();
      if (item) params.set(key, item);
      else params.delete(key);
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  function change(patch: Partial<VisitFiltersValue>, debounce = false) {
    const next = { ...local, ...patch };
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
    else navigate(next);
  }

  const hasFilters = Boolean(value.q || value.status || value.reason || value.from || value.to);

  return (
    <form
      role="search"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate(local);
      }}
    >
      <div className="flex items-end gap-3">
        <Field id="visit-search" label="Rechercher" className="flex-1">
          {(control) => (
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-2"
                aria-hidden="true"
              />
              <Input
                {...control}
                name="q"
                type="search"
                value={local.q}
                onChange={(event) => change({ q: event.target.value }, true)}
                placeholder="Titre ou site"
                maxLength={200}
                autoComplete="off"
                className="pl-11"
              />
            </div>
          )}
        </Field>
        <Button
          type="button"
          variant="secondary"
          className="md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="visit-filters"
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          Filtres
        </Button>
      </div>
      <div
        id="visit-filters"
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4",
          open ? "grid" : "hidden md:grid",
        )}
      >
        <Field id="visit-status" label="Statut">
          {(control) => (
            <Select
              {...control}
              name="status"
              value={local.status}
              onChange={(event) => change({ status: event.target.value })}
            >
              <option value="">Tous</option>
              {VISIT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {VISIT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="visit-reason" label="Motif">
          {(control) => (
            <Select
              {...control}
              name="reason"
              value={local.reason}
              onChange={(event) => change({ reason: event.target.value })}
            >
              <option value="">Tous</option>
              {VISIT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {VISIT_REASON_LABELS[reason]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="visit-from" label="Du" error={periodError}>
          {(control) => (
            <Input
              {...control}
              name="from"
              type="date"
              value={local.from}
              onChange={(event) => change({ from: event.target.value })}
            />
          )}
        </Field>
        <Field id="visit-to" label="Au">
          {(control) => (
            <Input
              {...control}
              name="to"
              type="date"
              value={local.to}
              onChange={(event) => change({ to: event.target.value })}
            />
          )}
        </Field>
      </div>
      {hasFilters ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ q: "", status: "", reason: "", from: "", to: "" })}
          >
            Effacer les filtres
          </Button>
        </div>
      ) : null}
    </form>
  );
}
