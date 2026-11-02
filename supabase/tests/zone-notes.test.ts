import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  type Client,
  connect,
  denied,
  inTransaction,
  succeeded,
  VISITS,
} from "./helpers";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

const NOTE_ROOF_V1 = "40000000-0000-4000-8000-000000000001";
const NOTE_DOCKS_V1 = "40000000-0000-4000-8000-000000000002";

async function visitVersion(id: string): Promise<number> {
  const { rows } = await client.query<{ version: number }>(
    "select version from public.visits where id = $1",
    [id],
  );
  return rows[0]!.version;
}

async function note(id: string) {
  const { rows } = await client.query<{
    version: number;
    updated_by: string | null;
    updated_at: Date;
    content: string;
  }>("select version, updated_by, updated_at, content from public.visit_zone_notes where id = $1", [
    id,
  ]);
  return rows[0]!;
}

describe("visit_zone_notes.version (migration 12)", () => {
  it("increments the note version, updated_by and updated_at when the content changes", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      const before = await note(NOTE_ROOF_V1);
      expect(before.version).toBe(1);
      const result = await attempt(
        client,
        "update public.visit_zone_notes set content = 'Nouveau contenu' where id = $1",
        [NOTE_ROOF_V1],
      );
      expect(succeeded(result)).toBe(true);
      const after = await note(NOTE_ROOF_V1);
      expect(after.version).toBe(2);
      expect(after.updated_by).toBe(ACTORS.bruno.kind === "user" ? ACTORS.bruno.id : null);
      expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime());
    });
  });

  it("leaves the note version, updated_by and updated_at untouched on a rename or reorder", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      const before = await note(NOTE_ROOF_V1);
      expect(
        succeeded(
          await attempt(
            client,
            "update public.visit_zone_notes set zone_label = 'Toiture et lanterneaux', sort_order = 9 where id = $1",
            [NOTE_ROOF_V1],
          ),
        ),
      ).toBe(true);
      const after = await note(NOTE_ROOF_V1);
      expect(after.version).toBe(before.version);
      expect(after.updated_by).toBe(before.updated_by);
      expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
    });
  });

  it("keeps the visit and the zone key immutable", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const result = await attempt(
        client,
        "update public.visit_zone_notes set zone_key = 'roof-2' where id = $1",
        [NOTE_ROOF_V1],
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toMatch(/immuables/);
    });
  });
});

describe("structure changes touch the parent visit once per statement", () => {
  it("does not bump the visit when only the content changes", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const before = await visitVersion(VISITS.v1InProgress);
      await client.query("update public.visit_zone_notes set content = 'Texte' where id = $1", [
        NOTE_ROOF_V1,
      ]);
      expect(await visitVersion(VISITS.v1InProgress)).toBe(before);
    });
  });

  it("bumps the visit once for an insert of several zones, once for a rename and once for a delete", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const start = await visitVersion(VISITS.v1InProgress);
      await client.query(
        `insert into public.visit_zone_notes (visit_id, zone_key, zone_label, sort_order)
         values ($1, 'facades', 'Façades', 10), ($1, 'drainage', 'Réseaux EU/EP', 11), ($1, 'fire_safety', 'Sécurité incendie', 12)`,
        [VISITS.v1InProgress],
      );
      expect(await visitVersion(VISITS.v1InProgress)).toBe(start + 1);

      await client.query(
        "update public.visit_zone_notes set zone_label = 'Quais de chargement' where id = $1",
        [NOTE_DOCKS_V1],
      );
      expect(await visitVersion(VISITS.v1InProgress)).toBe(start + 2);

      await client.query(
        "update public.visit_zone_notes set sort_order = sort_order + 100 where visit_id = $1",
        [VISITS.v1InProgress],
      );
      expect(await visitVersion(VISITS.v1InProgress)).toBe(start + 3);

      await client.query(
        "delete from public.visit_zone_notes where zone_key = 'facades' and visit_id = $1",
        [VISITS.v1InProgress],
      );
      expect(await visitVersion(VISITS.v1InProgress)).toBe(start + 4);

      const { rows } = await client.query<{ updated_by: string | null }>(
        "select updated_by from public.visits where id = $1",
        [VISITS.v1InProgress],
      );
      expect(rows[0]!.updated_by).toBe(ACTORS.alice.kind === "user" ? ACTORS.alice.id : null);
    });
  });
});

describe("visit_summaries zone counters", () => {
  it("counts the zones and the filled ones, computed at read time", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.claire);
      const read = async () => {
        const { rows } = await client.query<{ zones_count: number; filled_zones_count: number }>(
          "select zones_count, filled_zones_count from public.visit_summaries where id = $1",
          [VISITS.v1InProgress],
        );
        return rows[0]!;
      };
      expect(await read()).toEqual({ zones_count: 4, filled_zones_count: 4 });
      await actAs(client, ACTORS.alice);
      await client.query("update public.visit_zone_notes set content = '   ' where id = $1", [
        NOTE_ROOF_V1,
      ]);
      await client.query(
        "insert into public.visit_zone_notes (visit_id, zone_key, zone_label, sort_order) values ($1, 'facades', 'Façades', 10)",
        [VISITS.v1InProgress],
      );
      expect(await read()).toEqual({ zones_count: 5, filled_zones_count: 3 });
    });
  });
});

describe("row level security on zone notes", () => {
  it("lets Bruno (participant) write, refuses Emma (not involved) and Claire (direction)", async () => {
    for (const [actor, allowed] of [
      ["bruno", true],
      ["emma", false],
      ["claire", false],
    ] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await attempt(
          client,
          "update public.visit_zone_notes set content = 'Essai' where id = $1",
          [NOTE_ROOF_V1],
        );
        expect(allowed ? succeeded(result) : denied(result), actor).toBe(true);
      });
    }
  });

  it("refuses any content change on a completed visit, even by its creator", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      const result = await attempt(
        client,
        "update public.visit_zone_notes set content = 'Trop tard' where id = '40000000-0000-4000-8000-000000000005'",
      );
      expect(denied(result)).toBe(true);
    });
  });
});
