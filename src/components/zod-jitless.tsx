"use client";

import { z } from "zod";

// Zod 4 probes `Function("")` to compile its parsers. The CSP forbids eval: the probe fails
// silently but is reported as a violation. Jitless parsing is plenty fast for our forms.
z.config({ jitless: true });

/**
 * Turns off Zod's compiled parsers in the browser (CSP without `unsafe-eval`). Rendered once
 * by the root layout; renders nothing.
 */
export function ZodJitless() {
  return null;
}
