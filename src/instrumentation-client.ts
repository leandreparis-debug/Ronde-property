import { z } from "zod";

/*
 * Runs in the browser before any application code (Next.js `instrumentation-client`).
 *
 * Zod 4 probes `Function("")` the first time it parses an object, to compile its parsers. The
 * CSP forbids eval (no `unsafe-eval`): the probe fails silently but is reported as a violation.
 * Configured here, jitless mode is on before the first parse, whatever module parses first
 * (the offline shell evaluates its modules in another order than the server-rendered pages).
 */
z.config({ jitless: true });
