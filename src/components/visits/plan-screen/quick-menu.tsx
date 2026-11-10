"use client";

import { Camera, StickyNote, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { quickMenuPosition } from "@/lib/plans/visit-plan";

/** Size of the quick menu: three 56 px buttons with their label. */
export const QUICK_MENU_SIZE = { width: 252, height: 76 } as const;

/** Choice of the quick menu. */
export type QuickChoice = "photo" | "reserve" | "note";

const CHOICES: Array<{ value: QuickChoice; label: string; icon: typeof Camera }> = [
  { value: "photo", label: "Photo", icon: Camera },
  { value: "reserve", label: "Réserve", icon: TriangleAlert },
  { value: "note", label: "Note", icon: StickyNote },
];

/**
 * Quick menu of the plan screen (step 12 b): a short tap on the plan shows, at the touched
 * point, three 56 px buttons « Photo », « Réserve », « Note ». It is drawn above the point
 * (below it near the top edge) so the point stays visible, marked by a small target. A tap
 * elsewhere, Escape or a pan closes it; nothing is created without a choice.
 */
export function QuickMenu({
  screen,
  canvas,
  onChoose,
  onClose,
}: {
  /** Touched point, in canvas pixels. */
  screen: { x: number; y: number };
  canvas: { width: number; height: number };
  onChoose: (choice: QuickChoice) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const position = quickMenuPosition(screen, canvas, QUICK_MENU_SIZE);

  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-3 border-brand bg-paper"
        style={{ left: screen.x, top: screen.y }}
        data-testid="quick-menu-target"
      />
      <div
        role="menu"
        aria-label="Ajouter à cet endroit"
        className="absolute z-20 flex gap-2 rounded-xl border border-rule bg-paper p-2 shadow-raised"
        style={{ left: position.left, top: position.top, width: QUICK_MENU_SIZE.width }}
        data-testid="quick-menu"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
      >
        {CHOICES.map((choice, index) => {
          const Icon = choice.icon;
          return (
            <button
              key={choice.value}
              ref={index === 0 ? first : undefined}
              type="button"
              role="menuitem"
              className={cn(
                "flex h-14 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-label font-semibold",
                "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                choice.value === "photo" && "bg-brand text-on-brand",
                choice.value === "reserve" && "bg-ink text-paper",
                choice.value === "note" && "bg-note text-note-ink",
              )}
              onClick={() => onChoose(choice.value)}
              data-testid={`quick-${choice.value}`}
            >
              <Icon className="size-6" aria-hidden="true" />
              {choice.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
