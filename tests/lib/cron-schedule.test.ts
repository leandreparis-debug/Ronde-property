import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { dailyCronForParisTime, parisTimeToUtc } from "@/lib/cron-schedule";

describe("cron slot", () => {
  it("converts 3 a.m. in Paris to UTC in winter and in summer", () => {
    expect(parisTimeToUtc(3, 0, new Date("2026-01-15T00:00:00Z"))).toEqual({ hour: 2, minute: 0 });
    expect(parisTimeToUtc(3, 0, new Date("2026-07-15T00:00:00Z"))).toEqual({ hour: 1, minute: 0 });
    expect(parisTimeToUtc(0, 30, new Date("2026-01-15T00:00:00Z"))).toEqual({
      hour: 23,
      minute: 30,
    });
  });

  it("schedules the purge of vercel.json at 3 a.m. Paris time (winter)", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const purge = vercel.crons.find((cron) => cron.path === "/api/cron/purge");
    expect(purge?.schedule).toBe(dailyCronForParisTime(3));
    expect(dailyCronForParisTime(3)).toBe("0 2 * * *");
  });
});
