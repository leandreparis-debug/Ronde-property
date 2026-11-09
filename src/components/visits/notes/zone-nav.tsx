"use client";

import { Images } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PendingDot } from "@/components/offline/pending-dot";
import { cn } from "@/lib/cn";
import type { NoteSaveStatus } from "@/lib/notes/status";

export interface ZoneNavItem {
  id: string;
  zoneKey: string;
  zoneLabel: string;
  filled: boolean;
  status?: NoteSaveStatus;
  /** An operation of the zone waits in the outbox. */
  pending?: boolean;
  /** Photos linked to the zone. */
  photos?: number;
}

/** Short state shown next to a zone while a save is running or failing. */
export function shortStatus(status: NoteSaveStatus | undefined): string | null {
  if (!status) return null;
  if (status.kind === "saving") return "Enregistrement…";
  if (status.kind === "offline") return status.deviceOffline ? "Hors réseau" : "Hors connexion";
  if (status.kind === "error") return "Erreur";
  return null;
}

/**
 * Zone selector: a vertical list from 1024 px (260 px column) and a horizontal row of
 * touch pills below. Both render the same items; CSS shows one at a time.
 */
export function ZoneNav({
  items,
  selectedId,
  onSelect,
}: {
  items: ZoneNavItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <nav aria-label="Zones" className="hidden w-[260px] shrink-0 lg:block">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const selected = item.id === selectedId;
            const state = shortStatus(item.status);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                  data-testid="zone-item"
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border-l-4 px-3 py-2 text-left text-ui",
                    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    selected
                      ? "border-brand bg-brand-soft font-semibold text-brand-deep"
                      : "border-transparent text-ink hover:bg-galet",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{item.zoneLabel}</span>
                    {item.pending ? <PendingDot /> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {state ? <span className="text-label text-ink-2">{state}</span> : null}
                    {item.photos ? (
                      <span className="inline-flex items-center gap-0.5 text-label text-ink-2">
                        <Images className="size-3.5" aria-hidden="true" />
                        {item.photos}
                        <span className="sr-only"> photo{item.photos > 1 ? "s" : ""}</span>
                      </span>
                    ) : null}
                    <Badge variant={item.filled ? "brand" : "neutral"}>
                      {item.filled ? "Renseignée" : "Vide"}
                    </Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        role="group"
        aria-label="Zones"
        className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-2 lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          const state = shortStatus(item.status);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(item.id)}
              data-testid="zone-chip"
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-pill border px-4 text-ui font-semibold whitespace-nowrap",
                "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                selected
                  ? "border-brand bg-brand text-on-brand"
                  : "border-rule bg-paper text-ink hover:bg-craie",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-pill",
                  selected ? "bg-on-brand" : item.filled ? "bg-brand" : "bg-rule",
                )}
              />
              {item.zoneLabel}
              {item.pending ? <PendingDot /> : null}
              <span className="sr-only">{item.filled ? ", renseignée" : ", vide"}</span>
              {state ? <span className="text-label opacity-80">{state}</span> : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
