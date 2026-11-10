"use client";

import { Building2, ChevronRight, Layers } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { SiteBuildingView } from "@/lib/plans/structure";
import { levelsOf, type PlanLocation, type ScreenView } from "@/lib/plans/visit-plan";

/** Count badge of the entries of the visit (on a building, a level, the shutter). */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-label font-semibold text-paper",
        className,
      )}
      data-testid="count-badge"
      data-count={count}
    >
      {count}
      <span className="sr-only"> {count > 1 ? "entrées" : "entrée"}</span>
    </span>
  );
}

/** One step of the breadcrumb. */
export interface Crumb {
  label: string;
  location: PlanLocation | null;
}

/**
 * Breadcrumb of the plan screen: « Vue extérieure › Bâtiment B › R+1 », every step but the
 * last touchable. Not shown when there is a single step (one level, no exterior view).
 */
export function PlanBreadcrumb({
  crumbs,
  onGo,
  trailing,
}: {
  crumbs: Crumb[];
  onGo: (location: PlanLocation) => void;
  trailing?: ReactNode;
}) {
  if (crumbs.length <= 1 && !trailing) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      {crumbs.length > 1 ? (
        <nav aria-label="Emplacement sur le plan" className="min-w-0" data-testid="plan-breadcrumb">
          <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-ui">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-0.5">
                  {index > 0 ? (
                    <ChevronRight className="size-4 shrink-0 text-ink-2" aria-hidden="true" />
                  ) : null}
                  {last || !crumb.location ? (
                    <span
                      className="truncate px-1 font-semibold text-ink"
                      aria-current={last ? "location" : undefined}
                      data-testid="breadcrumb-current"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="min-h-touch truncate rounded-md px-2 font-semibold text-brand-deep underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-brand"
                      onClick={() => onGo(crumb.location!)}
                      data-testid="breadcrumb-step"
                    >
                      {crumb.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : (
        <span />
      )}
      {trailing}
    </div>
  );
}

/** Tabs of the levels of a building, from the bottom up, with their count badge. */
export function LevelTabs({
  levels,
  currentId,
  counts,
  onSelect,
}: {
  levels: ScreenView[];
  currentId: string;
  counts: Map<string, number>;
  onSelect: (viewId: string) => void;
}) {
  if (levels.length <= 1) return null;
  return (
    <div
      role="tablist"
      aria-label="Étages du bâtiment"
      className="flex gap-1 overflow-x-auto rounded-lg bg-galet p-1"
      data-testid="level-tabs"
    >
      {levels.map((level) => {
        const active = level.view.id === currentId;
        return (
          <button
            key={level.view.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "flex min-h-touch shrink-0 items-center gap-1.5 rounded-md px-3 text-ui font-semibold",
              "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
              active ? "bg-paper text-ink shadow-raised" : "text-ink-2",
            )}
            onClick={() => onSelect(level.view.id)}
            data-testid="level-tab"
            data-label={level.view.label}
          >
            {level.view.label}
            {level.badge ? <span className="text-label font-normal">· {level.badge}</span> : null}
            <CountBadge count={counts.get(level.view.id) ?? 0} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * List of the buildings (cards with the thumbnail of their first level, the number of levels
 * and the entries of the visit), or of the levels of one building.
 */
export function BuildingCards({
  buildings,
  views,
  buildingCounts,
  viewCounts,
  onOpenBuilding,
}: {
  buildings: SiteBuildingView[];
  views: ScreenView[];
  buildingCounts: Map<string, number>;
  viewCounts: Map<string, number>;
  onOpenBuilding: (buildingId: string) => void;
}) {
  return (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Bâtiments du site"
      data-testid="building-cards"
    >
      {buildings.map((building) => {
        const levels = levelsOf(building.id, views);
        const first = levels[0];
        const count = buildingCounts.get(building.id) ?? 0;
        return (
          <li key={building.id}>
            <button
              type="button"
              className="flex w-full flex-col overflow-hidden rounded-xl border border-rule bg-paper text-left hover:border-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => onOpenBuilding(building.id)}
              data-testid="building-card"
              data-name={building.name}
            >
              <span className="flex h-36 items-center justify-center bg-craie">
                {(first?.page.thumbUrl ?? first?.page.imageUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob or signed URL
                  <img
                    src={(first.page.thumbUrl ?? first.page.imageUrl)!}
                    alt=""
                    className="size-full object-contain"
                  />
                ) : (
                  <Building2 className="size-10 text-ink-2" aria-hidden="true" />
                )}
              </span>
              <span className="flex min-h-touch-lg items-center gap-2 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-title-sm text-ink">
                    {building.name}
                  </span>
                  <span className="flex items-center gap-1 text-label text-ink-2">
                    <Layers className="size-4" aria-hidden="true" />
                    {levels.length > 1 ? `${levels.length} étages` : "1 étage"}
                    {levels.length > 0
                      ? ` · ${levels.map((l) => `${l.view.label}${(viewCounts.get(l.view.id) ?? 0) > 0 ? ` (${viewCounts.get(l.view.id)})` : ""}`).join(", ")}`
                      : ""}
                  </span>
                </span>
                <CountBadge count={count} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Cards of the levels of a building (breadcrumb « Bâtiment B »), from the bottom up. */
export function LevelCards({
  levels,
  counts,
  onOpen,
}: {
  levels: ScreenView[];
  counts: Map<string, number>;
  onOpen: (viewId: string) => void;
}) {
  return (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Étages du bâtiment"
      data-testid="level-cards"
    >
      {levels.map((level) => (
        <li key={level.view.id}>
          <button
            type="button"
            className="flex w-full flex-col overflow-hidden rounded-xl border border-rule bg-paper text-left hover:border-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
            onClick={() => onOpen(level.view.id)}
            data-testid="level-card"
            data-label={level.view.label}
          >
            <span className="flex h-36 items-center justify-center bg-craie">
              {(level.page.thumbUrl ?? level.page.imageUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob or signed URL
                <img
                  src={(level.page.thumbUrl ?? level.page.imageUrl)!}
                  alt=""
                  className="size-full object-contain"
                />
              ) : (
                <Layers className="size-10 text-ink-2" aria-hidden="true" />
              )}
            </span>
            <span className="flex min-h-touch-lg items-center gap-2 p-3">
              <span className="min-w-0 flex-1 truncate font-display text-title-sm text-ink">
                {level.view.label}
                {level.badge ? (
                  <span className="ml-2 text-label font-normal text-ink-2">{level.badge}</span>
                ) : null}
              </span>
              <CountBadge count={counts.get(level.view.id) ?? 0} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
