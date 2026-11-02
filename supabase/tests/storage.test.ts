import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  type ActorName,
  actAs,
  attempt,
  type Client,
  connect,
  denied,
  inTransaction,
  SITES,
  succeeded,
  VISITS,
} from "./helpers";

/*
 * Storage policies are tested by inserting rows into storage.objects directly, as the
 * Storage API would. The first path segment identifies the visit or the site.
 */

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

const ACTORS_LIST: ActorName[] = ["anon", "alice", "bruno", "emma", "claire", "david", "inactif"];

async function insertObject(bucket: string, name: string) {
  return attempt(client, "insert into storage.objects (bucket_id, name) values ($1, $2)", [
    bucket,
    name,
  ]);
}

async function seedObject(bucket: string, name: string) {
  await client.query("reset role");
  await client.query(
    "insert into storage.objects (bucket_id, name) values ($1, $2) on conflict do nothing",
    [bucket, name],
  );
}

describe("buckets", () => {
  it("are private with size and MIME limits", async () => {
    const { rows } = await client.query<{
      id: string;
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>("select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id");
    expect(rows.map((r) => r.id)).toEqual(["reports", "site-plans", "visit-photos"]);
    for (const row of rows) expect(row.public).toBe(false);
    expect(Number(rows.find((r) => r.id === "visit-photos")?.file_size_limit)).toBe(
      15 * 1024 * 1024,
    );
    expect(Number(rows.find((r) => r.id === "site-plans")?.file_size_limit)).toBe(50 * 1024 * 1024);
    expect(rows.find((r) => r.id === "reports")?.allowed_mime_types).toEqual(["application/pdf"]);
  });
});

describe("visit-photos", () => {
  const path = `${VISITS.v1InProgress}/photo-test.jpg`;
  const expected: Record<ActorName, boolean> = {
    anon: false,
    alice: true,
    bruno: true,
    emma: false,
    claire: false,
    david: true,
    inactif: false,
    service: true,
    postgres: true,
  };

  for (const actor of ACTORS_LIST) {
    it(`${actor} ${expected[actor] ? "can" : "cannot"} upload to an editable visit`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await insertObject("visit-photos", path);
        expect(expected[actor] ? succeeded(result) : denied(result)).toBe(true);
      });
    });
  }

  it("is readable by every active user when the visit is readable, hidden from inactive users", async () => {
    await inTransaction(client, async () => {
      await seedObject("visit-photos", path);
      for (const actor of ["alice", "bruno", "emma", "claire", "david"] as const) {
        await actAs(client, ACTORS[actor]);
        const result = await attempt(
          client,
          "select name from storage.objects where bucket_id = 'visit-photos'",
        );
        expect(result.ok && result.rowCount, actor).toBe(1);
      }
      await actAs(client, ACTORS.inactif);
      const inactive = await attempt(
        client,
        "select name from storage.objects where bucket_id = 'visit-photos'",
      );
      expect(inactive.ok && inactive.rowCount).toBe(0);
    });
  });

  it("cannot be uploaded to a completed visit, even by its creator", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      expect(denied(await insertObject("visit-photos", `${VISITS.v2Completed}/photo.jpg`))).toBe(
        true,
      );
    });
  });

  it("can be deleted only by the editors of the visit", async () => {
    await inTransaction(client, async () => {
      await seedObject("visit-photos", path);
      await actAs(client, ACTORS.claire);
      expect(
        denied(await attempt(client, "delete from storage.objects where name = $1", [path])),
      ).toBe(true);
      await actAs(client, ACTORS.alice);
      expect(
        succeeded(await attempt(client, "delete from storage.objects where name = $1", [path])),
      ).toBe(true);
    });
  });

  it("rejects a path whose first segment is not a visit", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.david);
      expect(denied(await insertObject("visit-photos", "not-a-visit/photo.jpg"))).toBe(true);
    });
  });
});

describe("site-plans", () => {
  const path = `${SITES.lyon}/plan-test.pdf`;
  const expected: Record<ActorName, boolean> = {
    anon: false,
    alice: true,
    bruno: true,
    emma: true,
    claire: false,
    david: true,
    inactif: false,
    service: true,
    postgres: true,
  };

  for (const actor of ACTORS_LIST) {
    it(`${actor} ${expected[actor] ? "can" : "cannot"} upload a plan`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await insertObject("site-plans", path);
        expect(expected[actor] ? succeeded(result) : denied(result)).toBe(true);
      });
    });
  }

  it("is readable by every active user and never deletable", async () => {
    await inTransaction(client, async () => {
      await seedObject("site-plans", path);
      await actAs(client, ACTORS.claire);
      const read = await attempt(
        client,
        "select name from storage.objects where bucket_id = 'site-plans'",
      );
      expect(read.ok && read.rowCount).toBe(1);
      await actAs(client, ACTORS.david);
      expect(
        denied(await attempt(client, "delete from storage.objects where name = $1", [path])),
      ).toBe(true);
    });
  });
});

describe("reports", () => {
  const path = `${VISITS.v2Completed}/report-test.pdf`;
  const expected: Record<ActorName, boolean> = {
    anon: false,
    alice: true,
    bruno: true,
    emma: true,
    claire: true,
    david: true,
    inactif: false,
    service: true,
    postgres: true,
  };

  for (const actor of ACTORS_LIST) {
    it(`${actor} ${expected[actor] ? "can" : "cannot"} upload a report of a readable visit`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await insertObject("reports", path);
        expect(expected[actor] ? succeeded(result) : denied(result)).toBe(true);
      });
    });
  }

  it("cannot be uploaded for a deleted visit, and is never updated or deleted", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      expect(denied(await insertObject("reports", `${VISITS.v3Deleted}/report.pdf`))).toBe(true);
      await seedObject("reports", path);
      await actAs(client, ACTORS.david);
      expect(
        denied(
          await attempt(client, "update storage.objects set name = 'x/y.pdf' where name = $1", [
            path,
          ]),
        ),
      ).toBe(true);
      expect(
        denied(await attempt(client, "delete from storage.objects where name = $1", [path])),
      ).toBe(true);
    });
  });
});
