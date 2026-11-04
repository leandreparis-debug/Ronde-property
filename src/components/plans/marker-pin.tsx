import { cn } from "@/lib/cn";

/** On-screen size of a marker drawing, in CSS pixels, at every zoom level. */
export const MARKER_SIZE = 36;
/** Size of the tap area around a marker (touch-first: at least 44 px). */
export const MARKER_HIT = 44;

/**
 * Body of the mini pebble: the mascot outline ending in a point at the bottom centre, which
 * designates the exact position of the marker.
 */
const PIN_PATH =
  "M18 35 L13 29 C 5 28, 2 21, 4 14 C 6 6, 12 2, 19 2 C 27 2, 33 8, 33 16 C 33 23, 29 28, 23 29 Z";

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
  number: number;
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
          {number}
        </span>
      ) : null}
    </span>
  );
}
