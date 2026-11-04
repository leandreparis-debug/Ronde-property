import { describe, expect, it } from "vitest";

import { todayInParis } from "@/lib/format";
import {
  addDays,
  addMonths,
  applyDueShortcut,
  daysOverdue,
  isPastDate,
  overdueLabel,
} from "@/lib/reserves/dates";

describe("due-date shortcuts", () => {
  it("adds days across months and years", () => {
    expect(applyDueShortcut("2026-11-04", "7d")).toBe("2026-11-11");
    expect(applyDueShortcut("2026-12-25", "15d")).toBe("2027-01-09");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("clamps months to the end of the target month", () => {
    expect(applyDueShortcut("2026-01-31", "1m")).toBe("2026-02-28");
    expect(applyDueShortcut("2028-01-31", "1m")).toBe("2028-02-29");
    expect(applyDueShortcut("2026-03-31", "1m")).toBe("2026-04-30");
    expect(applyDueShortcut("2026-11-30", "3m")).toBe("2027-02-28");
    expect(applyDueShortcut("2027-11-30", "3m")).toBe("2028-02-29");
    expect(applyDueShortcut("2026-10-15", "3m")).toBe("2027-01-15");
  });

  it("keeps 29 February when it exists and falls back to the 28th otherwise", () => {
    expect(addMonths("2028-02-29", 1)).toBe("2028-03-29");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2027-11-29", 3)).toBe("2028-02-29");
  });
});

describe("overdue", () => {
  it("is never overdue on the due date, one day late the day after", () => {
    expect(daysOverdue("2026-11-04", "open", "2026-11-04")).toBe(0);
    expect(daysOverdue("2026-11-03", "open", "2026-11-04")).toBe(1);
    expect(daysOverdue("2026-10-20", "in_progress", "2026-11-04")).toBe(15);
    expect(daysOverdue("2026-10-20", "done", "2026-11-04")).toBe(0);
    expect(daysOverdue(null, "open", "2026-11-04")).toBe(0);
  });

  it("uses the Paris civil date around midnight", () => {
    // 23:30 UTC on 4 November is already 5 November in Paris (UTC+1 in winter).
    const today = todayInParis(new Date("2026-11-04T23:30:00Z"));
    expect(today).toBe("2026-11-05");
    expect(daysOverdue("2026-11-04", "open", today)).toBe(1);
    // 22:30 UTC on 4 November is 23:30 in Paris: still the due date.
    expect(daysOverdue("2026-11-04", "open", todayInParis(new Date("2026-11-04T22:30:00Z")))).toBe(
      0,
    );
  });

  it("formats « En retard de N j » and flags past dates", () => {
    expect(overdueLabel(1)).toBe("En retard de 1 j");
    expect(overdueLabel(15)).toBe("En retard de 15 j");
    expect(isPastDate("2026-11-03", "2026-11-04")).toBe(true);
    expect(isPastDate("2026-11-04", "2026-11-04")).toBe(false);
    expect(isPastDate("", "2026-11-04")).toBe(false);
  });
});
