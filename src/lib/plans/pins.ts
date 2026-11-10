/*
 * Shapes of the plan markers (36 × 36 viewBox), shared by the screen (MarkerPin, ReservePin)
 * and the PDF report so that both draw exactly the same markers.
 */

/**
 * Body of the mini pebble: the mascot outline ending in a point at the bottom centre, which
 * designates the exact position of the marker.
 */
export const PIN_PATH =
  "M18 35 L13 29 C 5 28, 2 21, 4 14 C 6 6, 12 2, 19 2 C 27 2, 33 8, 33 16 C 33 23, 29 28, 23 29 Z";

/** Square body of a reserve marker, ending in a point at the bottom centre (its position). */
export const RESERVE_PATH =
  "M18 35 L13 28 H7 a4 4 0 0 1 -4 -4 V6 a4 4 0 0 1 4 -4 H29 a4 4 0 0 1 4 4 V24 a4 4 0 0 1 -4 4 H23 Z";

/** Body of a note on the plan (step 12 b): a folded sticky note ending in a point. */
export const NOTE_PATH =
  "M18 35 L13 28 H6 a3 3 0 0 1 -3 -3 V5 a3 3 0 0 1 3 -3 H24 L33 11 V25 a3 3 0 0 1 -3 3 H23 Z";
