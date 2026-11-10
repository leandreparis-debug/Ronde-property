"use client";

import {
  Camera,
  ChevronDown,
  ChevronUp,
  Inbox,
  StickyNote,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { FeedEntry } from "@/lib/plans/visit-plan";

const ICONS = {
  photo: Camera,
  note: StickyNote,
  reserve: TriangleAlert,
  "to-sort": Inbox,
} as const;

/**
 * « Fil de visite » (step 12 b): collapsible band at the bottom of the plan screen with the 20
 * latest entries of the visit, every view together (« R-? · Fuite · Bât. B R+1 »). A tap on an
 * entry goes to its view and centres its marker. « Annuler » undoes the last entry made on
 * this screen for 10 seconds.
 */
export function VisitFeedBar({
  entries,
  open,
  onToggle,
  onOpenEntry,
  undo,
}: {
  entries: FeedEntry[];
  open: boolean;
  onToggle: () => void;
  onOpenEntry: (entry: FeedEntry) => void;
  /** Last entry that can still be undone, with its action. */
  undo: { label: string; run: () => void } | null;
}) {
  const id = useId();
  const latest = entries[0] ?? null;
  return (
    <section
      aria-label="Fil de visite"
      className="rounded-xl border border-rule bg-paper"
      data-testid="visit-feed"
      data-open={open ? "true" : "false"}
    >
      <div className="flex min-h-touch items-center gap-2 px-2">
        <button
          type="button"
          className="flex min-h-touch min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left focus-visible:outline-3 focus-visible:outline-brand"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onClick={onToggle}
          data-testid="visit-feed-toggle"
        >
          <span className="shrink-0 label-caps text-ink-2">Fil de visite</span>
          <span
            className="min-w-0 flex-1 truncate text-ui text-ink"
            data-testid="visit-feed-latest"
          >
            {latest ? latest.label : "Aucune saisie pour l'instant"}
          </span>
          {open ? (
            <ChevronDown className="size-5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronUp className="size-5 shrink-0" aria-hidden="true" />
          )}
        </button>
        {undo ? (
          <Button
            type="button"
            variant="secondary"
            onClick={undo.run}
            aria-label={`Annuler : ${undo.label}`}
            data-testid="visit-feed-undo"
          >
            <Undo2 className="size-5" aria-hidden="true" />
            Annuler
          </Button>
        ) : null}
      </div>
      {open ? (
        <ul
          id={`${id}-list`}
          className="flex max-h-56 flex-col overflow-y-auto border-t border-rule p-1"
          data-testid="visit-feed-list"
        >
          {entries.length === 0 ? (
            <li className="px-2 py-3 text-ui text-ink-2">
              Les photos, réserves et notes de la visite apparaîtront ici.
            </li>
          ) : (
            entries.map((entry) => {
              const Icon = ICONS[entry.kind];
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-left text-ui text-ink",
                      "hover:bg-galet focus-visible:outline-3 focus-visible:outline-brand",
                    )}
                    onClick={() => onOpenEntry(entry)}
                    data-testid="visit-feed-entry"
                    data-kind={entry.kind}
                  >
                    <Icon className="size-4 shrink-0 text-ink-2" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </section>
  );
}
