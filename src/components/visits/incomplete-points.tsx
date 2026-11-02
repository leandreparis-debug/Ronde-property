import { CircleAlert } from "lucide-react";

import type { IncompletePoint } from "@/server/domain/visits";

/** « À compléter » box: each point links to the field concerned. Never blocking. */
export function IncompletePoints({ points }: { points: IncompletePoint[] }) {
  if (points.length === 0) return null;
  return (
    <aside
      aria-labelledby="incomplete-title"
      className="rounded-lg border border-status-progress-dot bg-status-progress-bg p-4 text-ui text-status-progress"
      data-testid="incomplete-points"
    >
      <p id="incomplete-title" className="flex items-center gap-2 font-semibold">
        <CircleAlert className="size-5" aria-hidden="true" />À compléter
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {points.map((point) => (
          <li key={point.key}>
            <a href={`#${point.anchor}`} className="inline-flex min-h-11 items-center underline">
              {point.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
