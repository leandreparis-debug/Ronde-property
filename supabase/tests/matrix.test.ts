import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  type Attempt,
  actAs,
  attempt,
  type Client,
  connect,
  denied,
  inTransaction,
  MARKER_V1,
  PARTICIPANT_EXTERNAL_V1,
  PHOTO_V1,
  PLAN_LYON,
  REPORT_V2,
  RESERVES,
  SITES,
  succeeded,
  USERS,
  VISITS,
} from "./helpers";

/*
 * Rights matrix: one test per actor × table × operation, from the step 2 specification (§5).
 *
 * Actors: anon, alice (rt, creator of V1), bruno (rt, participant of V1), emma (rt, not
 * involved), claire (direction), david (admin), inactif (inactive rt).
 *
 * Expectations:
 *   "ok"      the statement succeeds and touches at least one row;
 *   "denied"  it raises (permission denied, policy violation) or touches no row;
 *   number    for reads: the exact number of visible rows;
 *   "none"    for reads: the query succeeds but returns no row (inactive user);
 *   "some"    for reads: at least one row (audit log, whose size depends on the seed).
 */

const MATRIX_ACTORS = ["anon", "alice", "bruno", "emma", "claire", "david", "inactif"] as const;
type MatrixActor = (typeof MATRIX_ACTORS)[number];

type ReadExpectation = number | "denied" | "none" | "some";
type WriteExpectation = "ok" | "denied";
type Expectations<T> = Record<MatrixActor, T>;

interface TableCase {
  table: string;
  read: { sql: string; expect: Expectations<ReadExpectation> };
  insert: { sql: (actor: MatrixActor) => string; expect: Expectations<WriteExpectation> };
  update: { sql: (actor: MatrixActor) => string; expect: Expectations<WriteExpectation> };
  delete: { sql: string; expect: Expectations<WriteExpectation> };
}

const userId = (actor: MatrixActor): string => {
  const value = ACTORS[actor];
  return value.kind === "user" ? value.id : USERS.alice;
};

const all = <T>(value: T): Expectations<T> => ({
  anon: value,
  alice: value,
  bruno: value,
  emma: value,
  claire: value,
  david: value,
  inactif: value,
});

/** Editors of V1: creator, participant and admin. */
const editorsOfV1: Expectations<WriteExpectation> = {
  anon: "denied",
  alice: "ok",
  bruno: "ok",
  emma: "denied",
  claire: "denied",
  david: "ok",
  inactif: "denied",
};

const rtOrAdmin: Expectations<WriteExpectation> = {
  anon: "denied",
  alice: "ok",
  bruno: "ok",
  emma: "ok",
  claire: "denied",
  david: "ok",
  inactif: "denied",
};

const activeUsersRead = (count: number): Expectations<ReadExpectation> => ({
  anon: "denied",
  alice: count,
  bruno: count,
  emma: count,
  claire: count,
  david: count,
  inactif: "none",
});

const CASES: TableCase[] = [
  {
    table: "profiles",
    read: {
      sql: "select id, full_name, role, is_active from public.profiles where id::text like '00000000-0000-4000-8000-%'",
      expect: activeUsersRead(6),
    },
    insert: {
      sql: () =>
        "insert into public.profiles (id, email, full_name) values (gen_random_uuid(), 'x@example.test', 'X')",
      expect: all("denied"),
    },
    update: {
      sql: (actor) =>
        `update public.profiles set full_name = 'Renommé' where id = '${userId(actor)}'`,
      expect: { ...all<WriteExpectation>("ok"), anon: "denied", inactif: "denied" },
    },
    delete: {
      sql: `delete from public.profiles where id = '${USERS.emma}'`,
      expect: all("denied"),
    },
  },
  {
    table: "sites",
    read: { sql: "select id from public.sites", expect: activeUsersRead(12) },
    insert: {
      sql: () => "insert into public.sites (warehouse_code, name) values ('TEST-999', 'Nouveau')",
      expect: all("denied"),
    },
    update: {
      sql: () => `update public.sites set name = 'Modifié' where id = '${SITES.lyon}'`,
      expect: all("denied"),
    },
    delete: {
      sql: `delete from public.sites where id = '${SITES.marseille}'`,
      expect: all("denied"),
    },
  },
  {
    table: "site_import_runs",
    read: {
      sql: "select id from public.site_import_runs",
      expect: { ...activeUsersRead(0), david: 1, alice: 0, bruno: 0, emma: 0, claire: 0 },
    },
    insert: {
      sql: () =>
        "insert into public.site_import_runs (file_name, mode) values ('x.csv', 'simulate')",
      expect: all("denied"),
    },
    update: {
      sql: () => "update public.site_import_runs set rows_total = 99",
      expect: all("denied"),
    },
    delete: { sql: "delete from public.site_import_runs", expect: all("denied") },
  },
  {
    table: "visits",
    read: {
      sql: `select id from public.visits where site_id in ('${SITES.lyon}', '${SITES.lille}', '${SITES.marseille}')`,
      expect: { ...activeUsersRead(2), david: 3 },
    },
    insert: {
      sql: (actor) =>
        `insert into public.visits (site_id, title, visit_date, created_by) values ('${SITES.lyon}', 'Nouvelle visite', current_date, '${userId(actor)}')`,
      expect: rtOrAdmin,
    },
    update: {
      sql: () =>
        `update public.visits set title = 'Titre modifié' where id = '${VISITS.v1InProgress}'`,
      expect: editorsOfV1,
    },
    delete: {
      sql: `delete from public.visits where id = '${VISITS.v1InProgress}'`,
      expect: all("denied"),
    },
  },
  {
    table: "visit_participants",
    read: {
      sql: `select id from public.visit_participants where visit_id = '${VISITS.v1InProgress}'`,
      expect: activeUsersRead(3),
    },
    insert: {
      sql: () =>
        `insert into public.visit_participants (visit_id, full_name) values ('${VISITS.v1InProgress}', 'Invité Fictif')`,
      expect: editorsOfV1,
    },
    update: {
      sql: () =>
        `update public.visit_participants set is_present = false where id = '${PARTICIPANT_EXTERNAL_V1}'`,
      expect: editorsOfV1,
    },
    delete: {
      sql: `delete from public.visit_participants where id = '${PARTICIPANT_EXTERNAL_V1}'`,
      expect: editorsOfV1,
    },
  },
  {
    table: "visit_zone_notes",
    read: {
      sql: `select id from public.visit_zone_notes where visit_id = '${VISITS.v1InProgress}'`,
      expect: activeUsersRead(4),
    },
    insert: {
      sql: () =>
        `insert into public.visit_zone_notes (visit_id, zone_key, zone_label) values ('${VISITS.v1InProgress}', 'facades', 'Façades et bardage')`,
      expect: editorsOfV1,
    },
    update: {
      sql: () =>
        `update public.visit_zone_notes set content = 'Modifié' where visit_id = '${VISITS.v1InProgress}' and zone_key = 'roof'`,
      expect: editorsOfV1,
    },
    delete: {
      sql: `delete from public.visit_zone_notes where visit_id = '${VISITS.v1InProgress}' and zone_key = 'custom-parking'`,
      expect: editorsOfV1,
    },
  },
  {
    table: "photos",
    read: {
      sql: `select id from public.photos where visit_id = '${VISITS.v1InProgress}'`,
      expect: activeUsersRead(1),
    },
    insert: {
      sql: () =>
        `insert into public.photos (visit_id, storage_path, mime_type) values ('${VISITS.v1InProgress}', '${VISITS.v1InProgress}/new.jpg', 'image/jpeg')`,
      expect: editorsOfV1,
    },
    update: {
      sql: () => `update public.photos set caption = 'Modifiée' where id = '${PHOTO_V1}'`,
      expect: editorsOfV1,
    },
    delete: { sql: `delete from public.photos where id = '${PHOTO_V1}'`, expect: editorsOfV1 },
  },
  {
    table: "site_plans",
    read: { sql: "select id from public.site_plans", expect: activeUsersRead(1) },
    insert: {
      sql: () =>
        `insert into public.site_plans (site_id, name, storage_path, mime_type) values ('${SITES.lyon}', 'Nouveau plan', '${SITES.lyon}/new.pdf', 'application/pdf')`,
      expect: rtOrAdmin,
    },
    update: {
      sql: () => `update public.site_plans set is_archived = true where id = '${PLAN_LYON}'`,
      expect: rtOrAdmin,
    },
    delete: {
      sql: `delete from public.site_plans where id = '${PLAN_LYON}'`,
      expect: all("denied"),
    },
  },
  {
    table: "plan_markers",
    read: {
      sql: `select id from public.plan_markers where visit_id = '${VISITS.v1InProgress}'`,
      expect: activeUsersRead(1),
    },
    insert: {
      sql: () =>
        `insert into public.plan_markers (visit_id, plan_id, x, y, number) values ('${VISITS.v1InProgress}', '${PLAN_LYON}', 0.5, 0.5, 2)`,
      expect: editorsOfV1,
    },
    update: {
      sql: () => `update public.plan_markers set label = 'Modifié' where id = '${MARKER_V1}'`,
      expect: editorsOfV1,
    },
    delete: {
      sql: `delete from public.plan_markers where id = '${MARKER_V1}'`,
      expect: editorsOfV1,
    },
  },
  {
    table: "reserves",
    read: {
      sql: `select id from public.reserves where visit_id = '${VISITS.v1InProgress}'`,
      expect: activeUsersRead(5),
    },
    insert: {
      sql: () =>
        `insert into public.reserves (visit_id, action, responsible_kind, responsible_profile_id) values ('${VISITS.v1InProgress}', 'Nouvelle réserve', 'internal', '${USERS.alice}')`,
      expect: editorsOfV1,
    },
    update: {
      sql: () =>
        `update public.reserves set action = 'Action modifiée' where id = '${RESERVES.r1Open}'`,
      expect: editorsOfV1,
    },
    delete: {
      sql: `delete from public.reserves where id = '${RESERVES.r1Open}'`,
      expect: all("denied"),
    },
  },
  {
    table: "reserve_photos",
    read: { sql: "select reserve_id from public.reserve_photos", expect: activeUsersRead(1) },
    insert: {
      sql: () =>
        `insert into public.reserve_photos (reserve_id, photo_id, kind) values ('${RESERVES.r2InProgress}', '${PHOTO_V1}', 'defect')`,
      expect: editorsOfV1,
    },
    update: {
      sql: () =>
        `update public.reserve_photos set kind = 'proof' where reserve_id = '${RESERVES.r1Open}' and photo_id = '${PHOTO_V1}'`,
      expect: editorsOfV1,
    },
    delete: {
      sql: `delete from public.reserve_photos where reserve_id = '${RESERVES.r1Open}' and photo_id = '${PHOTO_V1}'`,
      expect: editorsOfV1,
    },
  },
  {
    table: "reserve_events",
    read: {
      sql: `select id from public.reserve_events where reserve_id in (select id from public.reserves where visit_id = '${VISITS.v1InProgress}')`,
      expect: activeUsersRead(5),
    },
    insert: {
      sql: () =>
        `insert into public.reserve_events (reserve_id, event_type) values ('${RESERVES.r1Open}', 'updated')`,
      expect: all("denied"),
    },
    update: { sql: () => "update public.reserve_events set changes = '{}'", expect: all("denied") },
    delete: { sql: "delete from public.reserve_events", expect: all("denied") },
  },
  {
    table: "reports",
    read: { sql: "select id from public.reports", expect: activeUsersRead(1) },
    insert: {
      sql: (actor) =>
        `insert into public.reports (visit_id, storage_path, size_bytes, generated_by) values ('${VISITS.v1InProgress}', '${VISITS.v1InProgress}/new.pdf', 1000, '${userId(actor)}')`,
      expect: { ...all<WriteExpectation>("ok"), anon: "denied", inactif: "denied" },
    },
    update: {
      sql: () => `update public.reports set size_bytes = 1 where id = '${REPORT_V2}'`,
      expect: all("denied"),
    },
    delete: { sql: `delete from public.reports where id = '${REPORT_V2}'`, expect: all("denied") },
  },
  {
    table: "audit_log",
    read: {
      sql: "select id from public.audit_log",
      expect: {
        anon: "denied",
        alice: 0,
        bruno: 0,
        emma: 0,
        claire: 0,
        david: "some",
        inactif: "none",
      },
    },
    insert: {
      sql: () =>
        "insert into public.audit_log (action, entity_type) values ('test.direct', 'test')",
      expect: all("denied"),
    },
    update: {
      sql: () => "update public.audit_log set action = 'test.tampered'",
      expect: all("denied"),
    },
    delete: { sql: "delete from public.audit_log", expect: all("denied") },
  },
];

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

function expectWrite(result: Attempt, expectation: WriteExpectation) {
  if (expectation === "ok") {
    expect(succeeded(result), `attendu : autorisé, obtenu : ${JSON.stringify(result)}`).toBe(true);
  } else {
    expect(denied(result), `attendu : refusé, obtenu : ${JSON.stringify(result)}`).toBe(true);
  }
}

for (const tableCase of CASES) {
  describe(`matrice · ${tableCase.table}`, () => {
    for (const actor of MATRIX_ACTORS) {
      const readExpectation = tableCase.read.expect[actor];
      it(`${actor} · lecture → ${readExpectation}`, async () => {
        await inTransaction(client, async () => {
          await actAs(client, ACTORS[actor]);
          const result = await attempt(client, tableCase.read.sql);
          if (readExpectation === "denied") {
            expect(result.ok).toBe(false);
          } else if (readExpectation === "some") {
            expect(result.ok, JSON.stringify(result)).toBe(true);
            expect(result.ok && result.rowCount).toBeGreaterThan(0);
          } else if (readExpectation === "none") {
            expect(result.ok).toBe(true);
            expect(result.ok && result.rowCount).toBe(0);
          } else {
            expect(result.ok, JSON.stringify(result)).toBe(true);
            expect(result.ok && result.rowCount).toBe(readExpectation);
          }
        });
      });

      it(`${actor} · insertion → ${tableCase.insert.expect[actor]}`, async () => {
        await inTransaction(client, async () => {
          await actAs(client, ACTORS[actor]);
          expectWrite(
            await attempt(client, tableCase.insert.sql(actor)),
            tableCase.insert.expect[actor],
          );
        });
      });

      it(`${actor} · mise à jour → ${tableCase.update.expect[actor]}`, async () => {
        await inTransaction(client, async () => {
          await actAs(client, ACTORS[actor]);
          expectWrite(
            await attempt(client, tableCase.update.sql(actor)),
            tableCase.update.expect[actor],
          );
        });
      });

      it(`${actor} · suppression → ${tableCase.delete.expect[actor]}`, async () => {
        await inTransaction(client, async () => {
          await actAs(client, ACTORS[actor]);
          expectWrite(await attempt(client, tableCase.delete.sql), tableCase.delete.expect[actor]);
        });
      });
    }
  });
}
