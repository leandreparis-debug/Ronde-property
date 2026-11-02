import { cn } from "@/lib/cn";

export interface TrailProps {
  /** Width in pixels; the height follows the 2:1 ratio of the drawing. */
  width?: number;
  /** Draw small waypoint circles along the path. */
  showWaypoints?: boolean;
  /** Animate the stroke on first paint (disabled by `prefers-reduced-motion`). */
  animated?: boolean;
  className?: string;
}

/** Freehand loop that leaves from the left, goes round and comes back near its start. */
const TRAIL_PATH =
  "M22 118 C 40 70, 96 42, 150 52 C 206 62, 262 44, 300 74 C 336 104, 310 160, 250 166 C 190 172, 140 150, 96 160 C 60 168, 38 150, 34 128";

const WAYPOINTS: ReadonlyArray<readonly [number, number]> = [
  [150, 52],
  [300, 74],
  [96, 160],
];

/**
 * « Le trait de la ronde »: a continuous freehand path that walks round the site and
 * comes back towards its starting point. Decorative only (hidden from assistive
 * technologies); reserved for large empty states and the design page.
 */
export function Trail({
  width = 320,
  showWaypoints = true,
  animated = true,
  className,
}: TrailProps) {
  return (
    <svg
      viewBox="0 0 320 200"
      width={width}
      height={width / 1.6}
      aria-hidden="true"
      focusable="false"
      className={cn("block max-w-full", className)}
    >
      <path
        d={TRAIL_PATH}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        className={animated ? "trail-draw" : undefined}
      />
      {showWaypoints
        ? WAYPOINTS.map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="7"
              fill="var(--color-paper)"
              stroke="var(--color-brand)"
              strokeWidth="4"
              className={animated ? "trail-waypoint" : undefined}
            />
          ))
        : null}
    </svg>
  );
}
