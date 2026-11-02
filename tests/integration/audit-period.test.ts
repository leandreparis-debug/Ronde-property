import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withSystem } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { queryAuditLog } from "@/server/services/audit-log";

const DAVID = { id: "00000000-0000-4000-8000-000000000004" };

/** Inserts an audit entry at a given instant (test only: uses the internal write marker as postgres). */
async function insertAt(occurredAt: string, marker: string) {
  await withSystem("test.audit_period", async (trx) => {
    await sql`select set_config('ronde.internal_write', '1', true)`.execute(trx);
    await sql`
      insert into public.audit_log (occurred_at, action, entity_type, details)
      values (${occurredAt}::timestamptz, 'test.period', 'test', ${JSON.stringify({ marker })}::jsonb)
    `.execute(trx);
  });
}

async function markersFor(from: string, to: string): Promise<string[]> {
  const page = await queryAuditLog(DAVID, { action: "test.period", from, to }, 1);
  return page.entries.map((entry) => String(entry.details.marker)).sort();
}

const CASES = [
  // Spring forward: 29 March 2026, Paris switches from UTC+1 to UTC+2 at 02:00.
  {
    day: "2026-03-29",
    inside: "2026-03-28T23:30:00Z",
    before: "2026-03-28T22:30:00Z",
    after: "2026-03-29T22:30:00Z",
  },
  // Fall back: 25 October 2026, Paris switches from UTC+2 to UTC+1 at 03:00.
  {
    day: "2026-10-25",
    inside: "2026-10-24T22:30:00Z",
    before: "2026-10-24T21:30:00Z",
    after: "2026-10-25T23:30:00Z",
  },
];

beforeAll(async () => {
  for (const [index, c] of CASES.entries()) {
    await insertAt(c.inside, `${index}-inside`); // 00:30 Paris on day J
    await insertAt(c.before, `${index}-before`); // 23:30 Paris on day J-1
    await insertAt(c.after, `${index}-after`); // 00:30 Paris on day J+1
  }
});

afterAll(async () => {
  await closePool();
});

describe("audit log period filter in Europe/Paris", () => {
  it.each(CASES.map((c, index) => [c.day, index] as const))(
    "includes 00:30 Paris of %s and excludes the neighbours",
    async (day, index) => {
      const markers = await markersFor(day, day);
      expect(markers).toContain(`${index}-inside`);
      expect(markers).not.toContain(`${index}-before`);
      expect(markers).not.toContain(`${index}-after`);
    },
  );

  it("is inclusive on both bounds", async () => {
    const markers = await markersFor("2026-03-28", "2026-03-30");
    expect(markers).toEqual(expect.arrayContaining(["0-before", "0-inside", "0-after"]));
  });
});
