/**
 * Minimal in-memory limiter for the local provider: 10 failures per key within 15 minutes.
 * Per process only; Supabase enforces its own limits for the production provider.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const failures = new Map<string, number[]>();

export function isRateLimited(key: string, now = Date.now()): boolean {
  const recent = (failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()): void {
  const recent = (failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  failures.set(key, recent);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
