import { cn } from "@/lib/cn";
import { NOTE_PATH, PIN_PATH, RESERVE_PATH } from "@/lib/plans/pins";

/** On-screen size of a marker drawing, in CSS pixels, at every zoom level. */
export const MARKER_SIZE = 36;
/** Size of the tap area around a marker (touch-first: at least 44 px). */
export const MARKER_HIT = 44;

/**
 * A marker drawn as a mini « Galet »: brand body with white eyes when a photo is linked,
 * outline only (paper body, brand stroke and eyes) when there is none. Its number sits in a
 * pill. Always 36 px on screen; the point at the bottom centre is the marker position.
 */
export function MarkerPin({
  number,
  hasPhoto,
  selected = false,
  showNumber = true,
}: {
  /** `null` while the server has not given the number yet: shown « • ». */
  number: number | null;
  hasPhoto: boolean;
  selected?: boolean;
  showNumber?: boolean;
}) {
  return (
    <span className="relative block" style={{ width: MARKER_SIZE, height: MARKER_SIZE }}>
      <svg
        viewBox="0 0 36 36"
        width={MARKER_SIZE}
        height={MARKER_SIZE}
        aria-hidden="true"
        className={cn("block overflow-visible drop-shadow-sm", selected && "drop-shadow-md")}
      >
        <path
          d={PIN_PATH}
          fill={hasPhoto ? "var(--color-brand)" : "var(--color-paper)"}
          stroke={selected ? "var(--color-ink)" : "var(--color-brand)"}
          strokeWidth={selected ? 3 : 2.5}
          strokeLinejoin="round"
        />
        <rect
          x="18"
          y="12"
          width="3.2"
          height="6.5"
          rx="1.6"
          fill={hasPhoto ? "var(--color-on-brand)" : "var(--color-brand)"}
        />
        <rect
          x="24"
          y="12"
          width="3.2"
          height="6.5"
          rx="1.6"
          fill={hasPhoto ? "var(--color-on-brand)" : "var(--color-brand)"}
        />
      </svg>
      {showNumber ? (
        <span
          className={cn(
            "absolute -top-2 -right-3 inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1 text-label font-bold tabular-nums",
            selected ? "bg-ink text-on-brand" : "bg-paper text-ink ring-2 ring-brand",
          )}
        >
          {number ?? "•"}
        </span>
      ) : null}
    </span>
  );
}

/** Status of the reserve drawn by {@link ReservePin}. */
export interface ReservePinState {
  code: string;
  status: "open" | "in_progress" | "done";
  isOverdue: boolean;
}

/**
 * A reserve on the plan: a square pin (never the pebble shape of a plain marker) with an
 * exclamation mark, red when the reserve is open or overdue, amber in progress, neutral with a
 * check mark when done; its code (« R-07 ») sits in a pill. Same 36 px size and same anchor
 * as {@link MarkerPin}.
 */
export function ReservePin({
  reserve,
  selected = false,
  showCode = true,
}: {
  reserve: ReservePinState;
  selected?: boolean;
  showCode?: boolean;
}) {
  const done = reserve.status === "done";
  const fill = done
    ? "var(--color-galet)"
    : reserve.status === "in_progress" && !reserve.isOverdue
      ? "var(--color-status-progress-dot)"
      : "var(--color-status-open-dot)";
  const glyph = done ? "var(--color-ink-2)" : "var(--color-paper)";
  return (
    <span
      className="relative block"
      style={{ width: MARKER_SIZE, height: MARKER_SIZE }}
      data-reserve-status={reserve.isOverdue ? "overdue" : reserve.status}
    >
      <svg
        viewBox="0 0 36 36"
        width={MARKER_SIZE}
        height={MARKER_SIZE}
        aria-hidden="true"
        className={cn("block overflow-visible drop-shadow-sm", selected && "drop-shadow-md")}
      >
        <path
          d={RESERVE_PATH}
          fill={fill}
          stroke={
            selected ? "var(--color-ink)" : done ? "var(--color-ink-2)" : "var(--color-paper)"
          }
          strokeWidth={selected ? 3 : 2}
          strokeLinejoin="round"
        />
        {done ? (
          <path
            d="M11 15 L16 20 L25 10"
            fill="none"
            stroke={glyph}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect x="16.4" y="7" width="3.2" height="10" rx="1.6" fill={glyph} />
            <circle cx="18" cy="21.5" r="2" fill={glyph} />
          </>
        )}
      </svg>
      {showCode ? (
        <span
          className={cn(
            "absolute -top-2 left-6 inline-flex h-5 items-center rounded-pill px-1.5 text-label font-bold whitespace-nowrap tabular-nums",
            selected ? "bg-ink text-on-brand" : "bg-paper text-ink ring-2 ring-ink",
          )}
        >
          {reserve.code}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A note on the plan (step 12 b): a yellow sticky note with « ✎ », same 36 px size and anchor
 * as {@link MarkerPin}. The yellow is reserved for notes, never for a status.
 */
export function NotePin({ selected = false }: { selected?: boolean }) {
  return (
    <span className="relative block" style={{ width: MARKER_SIZE, height: MARKER_SIZE }}>
      <svg
        viewBox="0 0 36 36"
        width={MARKER_SIZE}
        height={MARKER_SIZE}
        aria-hidden="true"
        className={cn("block overflow-visible drop-shadow-sm", selected && "drop-shadow-md")}
      >
        <path
          d={NOTE_PATH}
          fill="var(--color-note)"
          stroke={selected ? "var(--color-ink)" : "var(--color-note-ink)"}
          strokeWidth={selected ? 3 : 2}
          strokeLinejoin="round"
        />
        <text
          x="17"
          y="20"
          textAnchor="middle"
          fontSize="15"
          fontWeight="700"
          fill="var(--color-note-ink)"
        >
          ✎
        </text>
      </svg>
    </span>
  );
}
