import { describe, expect, it } from "vitest";

import { EMPTY_VALUE, formatDate, formatDateTime, toValidDate } from "@/lib/format";

describe("formatDate", () => {
  it("formats in fr-FR with the requested style", () => {
    const date = "2026-12-15T10:00:00Z";
    expect(formatDate(date)).toBe("15/12/2026");
    expect(formatDate(date, "short")).toBe("15/12/2026");
    expect(formatDate(date, "medium")).toBe("15 déc. 2026");
    expect(formatDate(date, "long")).toBe("15 décembre 2026");
    expect(formatDate(date, "full")).toBe("mardi 15 décembre 2026");
  });

  it("accepts Date objects and timestamps", () => {
    expect(formatDate(new Date(Date.UTC(2026, 0, 5)))).toBe("05/01/2026");
    expect(formatDate(Date.UTC(2026, 0, 5))).toBe("05/01/2026");
  });

  it.each([null, undefined, "", "pas une date", "2026-13-45", Number.NaN])(
    "returns « — » for %s without throwing",
    (value) => {
      expect(formatDate(value)).toBe(EMPTY_VALUE);
      expect(formatDateTime(value)).toBe(EMPTY_VALUE);
    },
  );

  it("uses the Paris time zone around midnight", () => {
    // 23:30 UTC on 14 December is already 15 December in Paris (UTC+1).
    expect(formatDate("2026-12-14T23:30:00Z")).toBe("15/12/2026");
  });
});

describe("formatDateTime", () => {
  it("formats in winter time (UTC+1)", () => {
    expect(formatDateTime("2026-01-15T09:05:00Z")).toBe("15/01/2026 10:05");
  });

  it("formats in summer time (UTC+2)", () => {
    expect(formatDateTime("2026-07-01T12:30:00Z")).toBe("01/07/2026 14:30");
  });

  it("supports the long style", () => {
    expect(formatDateTime("2026-07-01T12:30:00Z", "long")).toBe("1 juillet 2026 14:30");
  });

  it("uses a 24-hour clock", () => {
    expect(formatDateTime("2026-03-10T22:00:00Z")).toBe("10/03/2026 23:00");
    expect(formatDateTime("2026-03-10T23:30:00Z")).toBe("11/03/2026 00:30");
  });
});

describe("toValidDate", () => {
  it("returns null for empty or invalid input", () => {
    expect(toValidDate(null)).toBeNull();
    expect(toValidDate("")).toBeNull();
    expect(toValidDate("n/a")).toBeNull();
    expect(toValidDate(new Date("invalid"))).toBeNull();
  });

  it("returns a Date for valid input", () => {
    expect(toValidDate("2026-02-03")).toBeInstanceOf(Date);
  });
});
