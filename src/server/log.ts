import { createHash } from "node:crypto";

/**
 * Structured server logger: one JSON line per event (`level`, `event`, data, `at`), read by the
 * Vercel logs today and by the internal server tomorrow. Everything is masked before writing:
 * - keys that name a secret (password, token, cookie, authorization, secret, key, signature…)
 *   → `[masqué]`;
 * - e-mail addresses, wherever they appear → `email:<sha256 16>` (same hash as the audit);
 * - JWTs and Supabase keys → `[jeton masqué]`; query strings of URLs (signed URLs) dropped;
 * - errors → name, code and masked message (stack outside production), never their SQL
 *   parameters.
 * Silent in tests unless a sink is given.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Destination of the formatted lines (console by default). */
export type LogSink = (level: LogLevel, line: string) => void;

const MASKED = "[masqué]";
const MAX_DEPTH = 6;

/** Keys whose value is never written, whatever its type. */
const SECRET_KEY =
  /pass(word|wd)?|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|signature|jwt|session|bearer|private[-_]?key|^key$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+)?/g;
const SUPABASE_KEY = /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_QUERY = /(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g;

/** Same 16-hex hash as `hashEmail` (audit): lets an admin match a log line to a person. */
function emailHash(email: string): string {
  return `email:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16)}`;
}

/** Masks e-mails, tokens and signed URL parameters inside a free text. */
export function maskText(text: string): string {
  return text
    .replace(JWT, "[jeton masqué]")
    .replace(SUPABASE_KEY, "[jeton masqué]")
    .replace(BEARER, "Bearer [masqué]")
    .replace(URL_QUERY, "$1?[paramètres masqués]")
    .replace(EMAIL, (match) => emailHash(match));
}

function maskError(error: Error, depth: number): Record<string, unknown> {
  const code = (error as { code?: unknown }).code;
  return {
    name: error.name,
    ...(typeof code === "string" ? { code } : {}),
    message: maskText(error.message),
    ...(process.env.NODE_ENV !== "production" && error.stack
      ? { stack: maskText(error.stack) }
      : {}),
    ...(error.cause !== undefined && depth < MAX_DEPTH
      ? { cause: maskValue(error.cause, depth + 1, new WeakSet()) }
      : {}),
  };
}

function maskValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return maskText(value);
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return maskError(value, depth);
  if (seen.has(value)) return "[circulaire]";
  if (depth >= MAX_DEPTH) return "[…]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => maskValue(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) out[key] = MASKED;
    else if (/e-?mail/i.test(key) && typeof item === "string") out[key] = emailHash(item);
    else out[key] = maskValue(item, depth + 1, seen);
  }
  return out;
}

/** Masks a log payload (exported for the tests and for callers that build their own lines). */
export function maskLogData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return maskValue(data, 0, new WeakSet()) as Record<string, unknown>;
}

const consoleSink: LogSink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
};

/** A logger writing to `sink` (console by default, silent in tests). */
export function createLogger(sink?: LogSink) {
  function write(level: LogLevel, event: string, data?: Record<string, unknown>) {
    if (!sink && process.env.NODE_ENV === "test") return;
    if (level === "debug" && process.env.NODE_ENV === "production") return;
    const line = JSON.stringify({
      level,
      event: maskText(event),
      ...maskLogData(data),
      at: new Date().toISOString(),
    });
    (sink ?? consoleSink)(level, line);
  }
  return {
    debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
    info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
    warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
    error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
  };
}

/** The application logger. */
export const log = createLogger();
