/**
 * Vercel Cron only knows UTC. RONDE wants its nightly tasks at a time of Paris: this computes
 * the UTC hour of that Paris time on a given day (winter UTC+1, summer UTC+2).
 */

/** UTC hour and minute of `hour:minute` in Europe/Paris on the day of `on`. */
export function parisTimeToUtc(
  hour: number,
  minute: number,
  on: Date,
): { hour: number; minute: number } {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(on);
  // Offset of Paris at that moment, in minutes (60 in winter, 120 in summer).
  const probe = new Date(`${day}T12:00:00Z`);
  const parisNoon = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(probe);
  const [h, m] = parisNoon.split(":").map(Number) as [number, number];
  const offset = h * 60 + m - 12 * 60;
  const total = (((hour * 60 + minute - offset) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/**
 * Daily cron expression (UTC) for a Paris time, computed in winter: the task then runs one
 * hour later in Paris during summer time (docs/cron.md).
 */
export function dailyCronForParisTime(hour: number, minute = 0): string {
  const utc = parisTimeToUtc(hour, minute, new Date("2026-01-15T00:00:00Z"));
  return `${utc.minute} ${utc.hour} * * *`;
}
