"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { QueryLink } from "@/components/offline/query-link";
import { useVisitMutations } from "@/components/offline/visit-mutations";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { replaceQuery } from "@/lib/offline/query";
import {
  countReserves,
  DEFAULT_RESERVE_FILTERS,
  filterReserves,
  hasActiveFilters,
  parseReserveFilters,
  plural,
  RESERVE_SORTS,
  type ReserveListFilters,
  type ReserveSort,
  sortReserves,
  writeReserveFilters,
} from "@/lib/reserves/list";
import {
  RESERVE_PRIORITIES,
  RESERVE_PRIORITY_LABELS,
  RESERVE_STATUS_LABELS,
  RESERVE_STATUSES,
  type ReservePriority,
  type ReserveStatus,
} from "@/server/domain/enums";
import type { PhotoView } from "@/server/photos/types";
import type { ReserveListItem } from "@/server/reserves/types";

import {
  NEW_RESERVE_MARKER_PARAM,
  NEW_RESERVE_PARAM,
  NEW_RESERVE_PHOTO_PARAM,
  reserveHref,
} from "@/lib/reserves/links";

import { ReserveCard } from "./reserve-card";
import { ReserveSheet, type ReserveSheetTarget, type SavedReserve } from "./reserve-sheet";

export interface ReservesTabProps {
  visitId: string;
  siteId: string;
  /** Reserves of the visit from the local store (« R-? » until the server numbers them). */
  reserves: ReserveListItem[];
  /** Entities with an operation waiting (« en attente » marks). */
  pendingIds?: Set<string>;
  zones: Array<{ key: string; label: string }>;
  photos: PhotoView[];
  canEdit: boolean;
}

/**
 * « Réserves » tab: counters (« N ouvertes · N en retard · N levées »), filters mirrored in the
 * URL (« Masquer les levées » on by default, status, priority, overdue only, zone, sort),
 * cards sorted overdue first then priority then due date, « Nouvelle réserve » (and a
 * floating button on tablet) opening the sheet. Read-only variant without the creation.
 */
export function ReservesTab({
  visitId,
  siteId,
  reserves,
  pendingIds = new Set(),
  zones,
  photos,
  canEdit,
}: ReservesTabProps) {
  const id = useId();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const mutations = useVisitMutations(visitId);
  const [sheet, setSheet] = useState<{
    target: ReserveSheetTarget;
    markerId: string | null;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filters follow the URL; the local copy answers at once while the URL is being replaced.
  const urlFilters = useMemo(() => parseReserveFilters(searchParams), [searchParams]);
  const [filters, setFilters] = useState(urlFilters);
  useEffect(() => setFilters(urlFilters), [urlFilters]);

  // « + Réserve » from Notes and « Créer une réserve ici » from the plan open the sheet.
  useEffect(() => {
    const requested = searchParams.get(NEW_RESERVE_PARAM);
    if (requested === null) return;
    const zone = requested !== "1" && zones.some((z) => z.key === requested) ? requested : null;
    const photo = searchParams.get(NEW_RESERVE_PHOTO_PARAM);
    const marker = searchParams.get(NEW_RESERVE_MARKER_PARAM);
    const params = new URLSearchParams(searchParams.toString());
    for (const key of [NEW_RESERVE_PARAM, NEW_RESERVE_PHOTO_PARAM, NEW_RESERVE_MARKER_PARAM]) {
      params.delete(key);
    }
    replaceQuery(params);
    if (!canEdit) return;
    setSheet({
      target: {
        kind: "create",
        zoneKey: zone,
        photoIds: photo && photos.some((p) => p.id === photo) ? [photo] : [],
      },
      markerId: marker,
    });
    setSheetOpen(true);
  }, [searchParams, zones, photos, canEdit]);

  function updateFilters(patch: Partial<ReserveListFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const params = writeReserveFilters(new URLSearchParams(window.location.search), next);
    replaceQuery(params);
  }

  function openCreate(zoneKey: string | null = filters.zone) {
    setSheet({ target: { kind: "create", zoneKey }, markerId: null });
    setSheetOpen(true);
  }

  async function saved(reserve: SavedReserve, options: { again: boolean }) {
    toast({
      variant: "success",
      title: reserve.queued
        ? `${reserve.code} enregistrée sur la tablette`
        : `${reserve.code} enregistrée`,
      description: reserve.queued ? "Elle partira au retour du réseau." : undefined,
    });
    if (!options.again) setSheetOpen(false);
    if (sheet?.markerId) {
      // « Créer une réserve ici »: the marker of the plan becomes the reserve's marker.
      const markerId = sheet.markerId;
      setSheet((current) => (current ? { ...current, markerId: null } : current));
      const result = await mutations.attachMarker(
        reserve.id,
        markerId,
        reserve.code,
        reserve.action,
      );
      if (!result.ok) toast({ variant: "error", title: result.error });
    }
  }

  const counts = countReserves(reserves);
  const visible = sortReserves(filterReserves(reserves, filters), filters.sort);
  const hiddenDone = !filters.showDone && !filters.status ? counts.done : 0;
  const zoneLabel = (key: string) => zones.find((z) => z.key === key)?.label ?? key;

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0" data-testid="reserves-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink" data-testid="reserves-counters">
          <strong>{plural(counts.open, "ouverte")}</strong>
          <span className="text-ink-2"> · </span>
          <strong className={cn(counts.overdue > 0 && "text-status-open")}>
            {counts.overdue} en retard
          </strong>
          <span className="text-ink-2"> · </span>
          <strong>{plural(counts.done, "levée")}</strong>
        </p>
        {canEdit ? (
          <Button
            type="button"
            size="lg"
            className="hidden lg:inline-flex"
            onClick={() => openCreate()}
            data-testid="reserve-new"
          >
            <Plus className="size-5" aria-hidden="true" />
            Nouvelle réserve
          </Button>
        ) : null}
      </div>

      {reserves.length > 0 ? (
        <section
          aria-label="Filtres des réserves"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-rule bg-paper p-3"
        >
          <label className="flex min-h-11 items-center gap-2 text-ui font-semibold text-ink">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={!filters.showDone}
              onChange={(event) => updateFilters({ showDone: !event.target.checked })}
              data-testid="reserves-hide-done"
            />
            Masquer les levées
          </label>
          <label className="flex min-h-11 items-center gap-2 text-ui font-semibold text-ink">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={filters.overdueOnly}
              onChange={(event) => updateFilters({ overdueOnly: event.target.checked })}
              data-testid="reserves-overdue-only"
            />
            En retard uniquement
          </label>
          <Field id={`${id}-status`} label="Statut" className="min-w-36">
            {(control) => (
              <Select
                {...control}
                value={filters.status ?? ""}
                onChange={(event) =>
                  updateFilters({ status: (event.target.value || null) as ReserveStatus | null })
                }
                data-testid="reserves-status"
              >
                <option value="">Tous</option>
                {RESERVE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {RESERVE_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id={`${id}-priority`} label="Priorité" className="min-w-36">
            {(control) => (
              <Select
                {...control}
                value={filters.priority ?? ""}
                onChange={(event) =>
                  updateFilters({
                    priority: (event.target.value || null) as ReservePriority | null,
                  })
                }
                data-testid="reserves-priority"
              >
                <option value="">Toutes</option>
                {[...RESERVE_PRIORITIES].reverse().map((priority) => (
                  <option key={priority} value={priority}>
                    {RESERVE_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id={`${id}-zone`} label="Zone" className="min-w-40">
            {(control) => (
              <Select
                {...control}
                value={filters.zone ?? ""}
                onChange={(event) => updateFilters({ zone: event.target.value || null })}
                data-testid="reserves-zone"
              >
                <option value="">Toutes les zones</option>
                {zones.map((zone) => (
                  <option key={zone.key} value={zone.key}>
                    {zone.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id={`${id}-sort`} label="Trier par" className="min-w-48">
            {(control) => (
              <Select
                {...control}
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value as ReserveSort })}
                data-testid="reserves-sort"
              >
                {RESERVE_SORTS.map((sort) => (
                  <option key={sort.key} value={sort.key}>
                    {sort.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {hasActiveFilters(filters) ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                updateFilters({ ...DEFAULT_RESERVE_FILTERS, showDone: filters.showDone })
              }
            >
              Effacer les filtres
            </Button>
          ) : null}
        </section>
      ) : null}

      {reserves.length === 0 ? (
        <EmptyState
          mood="happy"
          title="Aucune réserve, tout est en ordre"
          description={
            canEdit
              ? "Ajoutez une réserve dès qu'un point demande une action."
              : "Aucune réserve n'a été relevée pendant cette visite."
          }
          action={
            canEdit ? (
              <Button type="button" size="lg" onClick={() => openCreate()}>
                <Plus className="size-5" aria-hidden="true" />
                Nouvelle réserve
              </Button>
            ) : null
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          mood="happy"
          title={
            hiddenDone > 0 && !hasActiveFilters(filters)
              ? "Aucune réserve ouverte"
              : "Aucune réserve pour ces filtres"
          }
          description={
            hiddenDone > 0
              ? `${plural(hiddenDone, "levée masquée", "levées masquées")}.`
              : filters.zone
                ? `Aucune réserve dans la zone « ${zoneLabel(filters.zone)} ».`
                : undefined
          }
          action={
            hiddenDone > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateFilters({ showDone: true })}
                data-testid="reserves-show-done"
              >
                Afficher les levées
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 xl:grid-cols-2" data-testid="reserves-list">
            {visible.map((reserve) => (
              <li key={reserve.id}>
                <ReserveCard
                  reserve={reserve}
                  href={reserveHref(visitId, reserve.id)}
                  pending={pendingIds.has(reserve.id)}
                />
              </li>
            ))}
          </ul>
          {hiddenDone > 0 ? (
            <p className="text-ui text-ink-2">
              {plural(hiddenDone, "réserve levée masquée", "réserves levées masquées")}.{" "}
              <QueryLink
                href={`?${writeReserveFilters(new URLSearchParams(searchParams.toString()), { ...filters, showDone: true }).toString()}`}
                className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
              >
                Afficher les levées
              </QueryLink>
            </p>
          ) : null}
        </>
      )}

      {canEdit ? (
        <Button
          type="button"
          size="lg"
          className="fixed right-4 bottom-[calc(var(--spacing-bottomnav)+1rem+env(safe-area-inset-bottom))] z-20 rounded-pill shadow-raised lg:hidden"
          onClick={() => openCreate()}
          data-testid="reserve-new-fab"
        >
          <Plus className="size-5" aria-hidden="true" />
          Nouvelle réserve
        </Button>
      ) : null}

      {sheet ? (
        <ReserveSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          target={sheet.target}
          visitId={visitId}
          siteId={siteId}
          zones={zones}
          photos={photos}
          onSaved={(reserve, options) => void saved(reserve, options)}
        />
      ) : null}
    </div>
  );
}
