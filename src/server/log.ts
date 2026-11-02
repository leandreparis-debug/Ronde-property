/**
 * Minimal server logger. Never log passwords, emails in clear text, tokens or cookies.
 * Silent in tests.
 */
type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ level, event, ...data, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};
