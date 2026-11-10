"use client";

import type { Point } from "@/lib/plans/geometry";
import { outlineCenter, type SiteBuildingView } from "@/lib/plans/structure";

import { CountBadge } from "./plan-navigation";

/**
 * Outlines of the buildings drawn on the exterior view (step 12 b), with the name of each
 * building and the count of its entries. A tap inside an outline enters the building (handled
 * by the screen, the smallest outline wins); the name is also a button, for the keyboard and
 * screen readers.
 */
export function ExteriorOverlay({
  buildings,
  counts,
  project,
  onOpen,
}: {
  buildings: SiteBuildingView[];
  counts: Map<string, number>;
  project: (point: Point) => Point;
  onOpen: (buildingId: string) => void;
}) {
  const traced = buildings.filter((b) => !b.isArchived && b.outline && b.outline.length >= 3);
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
        data-testid="exterior-outlines"
      >
        {traced.map((building) => (
          <polygon
            key={building.id}
            points={building
              .outline!.map((p) => {
                const s = project(p);
                return `${s.x},${s.y}`;
              })
              .join(" ")}
            fill="var(--color-brand)"
            fillOpacity={0.14}
            stroke="var(--color-brand-deep)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            data-testid="exterior-outline"
          />
        ))}
      </svg>
      {traced.map((building) => {
        const center = project(outlineCenter(building.outline!));
        return (
          <button
            key={building.id}
            type="button"
            className="absolute flex min-h-touch -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-brand-deep bg-paper px-3 text-ui font-semibold whitespace-nowrap text-ink shadow-raised focus-visible:outline-3 focus-visible:outline-brand"
            style={{ left: center.x, top: center.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={() => onOpen(building.id)}
            data-testid="exterior-building"
            data-name={building.name}
          >
            {building.name}
            <CountBadge count={counts.get(building.id) ?? 0} />
          </button>
        );
      })}
    </>
  );
}
