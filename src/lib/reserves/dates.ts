/**
 * Due dates of reserves. Every date is a civil date `YYYY-MM-DD` in Europe/Paris (see
 * `todayInParis`); the arithmetic runs in UTC on those civil dates, so it never depends on
 * the time zone of the browser or of the server.
 */

/** Due-date shortcuts offered in the sheet. */
export const DUE_SHORTCUTS = [
  { key: "7d", label: "+7 j" },
  { key: "15d", label: "+15 j" },
  { key: "1m", label: "+1 mois" },
  { key: "3m", label: "+3 mois" },
] as const;
export type DueShortcut = (typeof DUE_SHORTCUTS)[number]["key"];

function parseCivil(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function formatCivil(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds days to a civil date. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = parseCivil(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return formatCivil(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

/**
 * Adds calendar months to a civil date, clamped to the end of the target month: 31 January
 * plus one month is 28 (or 29) February, never 3 March.
 */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = parseCivil(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return formatCivil(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** Due date of a shortcut from the given day (today in Paris). */
export function applyDueShortcut(today: string, shortcut: DueShortcut): string {
  switch (shortcut) {
    case "7d":
      return addDays(today, 7);
    case "15d":
      return addDays(today, 15);
    case "1m":
      return addMonths(today, 1);
    case "3m":
      return addMonths(today, 3);
  }
}

/** Whole days from `from` to `to` (civil dates); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = parseCivil(from);
  const b = parseCivil(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/**
 * Days of delay of a reserve: due strictly before today (Paris) and not done. A reserve due
 * today is not overdue; due yesterday, it is one day late. Same rule as the database
 * (`private.is_reserve_overdue`).
 */
export function daysOverdue(dueDate: string | null, status: string, today: string): number {
  if (!dueDate || status === "done") return 0;
  return Math.max(0, daysBetween(dueDate, today));
}

/** « En retard de N j ». */
export function overdueLabel(days: number): string {
  return `En retard de ${days} j`;
}

/** A due date in the past asks for a confirmation in the sheet. */
export function isPastDate(date: string, today: string): boolean {
  return date !== "" && daysBetween(today, date) < 0;
}
