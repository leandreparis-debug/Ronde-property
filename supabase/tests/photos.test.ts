import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  type Client,
  connect,
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

async function photosCount(visitId: string): Promise<number> {
  const { rows } = await client.query<{ photos_count: number }>(
    "select photos_count from public.visit_summaries where id = $1",
    [visitId],
  );
  return rows[0]!.photos_count;
}

function insertPhoto(
  visitId: string,
  name: string,
  options: { status?: "pending" | "ready"; cover?: boolean; ageHours?: number } = {},
) {
  return attempt(
    client,
    `insert into public.photos (visit_id, storage_path, thumb_path, mime_type, is_cover, upload_status, created_at)
     values ($1, $2, $3, 'image/jpeg', $4, $5, now() - make_interval(hours => $6))
     returning id`,
    [
      visitId,
      `${visitId}/${name}.jpg`,
      `${visitId}/${name}_thumb.jpg`,
      options.cover ?? false,
      options.status ?? "pending",
      options.ageHours ?? 0,
    ],
  );
}

describe("photos.upload_status (migration 14)", () => {
  it("creates a photo as pending by default and only counts ready photos in visit_summaries", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const before = await photosCount(VISITS.v1InProgress);
      const pending = await insertPhoto(VISITS.v1InProgress, "pending-one");
      expect(succeeded(pending)).toBe(true);
      expect(await photosCount(VISITS.v1InProgress)).toBe(before);

      const { rows } = await client.query<{ upload_status: string }>(
        "select upload_status from public.photos where id = $1",
        [(pending.ok && pending.rows[0]!.id) as string],
      );
      expect(rows[0]!.upload_status).toBe("pending");

      const ready = await insertPhoto(VISITS.v1InProgress, "ready-one", { status: "ready" });
      expect(succeeded(ready)).toBe(true);
      expect(await photosCount(VISITS.v1InProgress)).toBe(before + 1);
    });
  });

  it("refuses any status other than pending or ready", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const result = await attempt(
        client,
        "insert into public.photos (visit_id, storage_path, mime_type, upload_status) values ($1, $2, 'image/jpeg', 'failed')",
        [VISITS.v1InProgress, `${VISITS.v1InProgress}/bad-status.jpg`],
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe("23514");
    });
  });

  it("refuses two thumbnails with the same path", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      expect(succeeded(await insertPhoto(VISITS.v1InProgress, "dup"))).toBe(true);
      const result = await attempt(
        client,
        "insert into public.photos (visit_id, storage_path, thumb_path, mime_type) values ($1, $2, $3, 'image/jpeg')",
        [
          VISITS.v1InProgress,
          `${VISITS.v1InProgress}/dup-2.jpg`,
          `${VISITS.v1InProgress}/dup_thumb.jpg`,
        ],
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe("23505");
    });
  });

  it("limits the single cover to ready photos: pending covers never block, a second ready cover does", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      // V1 already has its ready cover in the seed: pending covers are still accepted (the flag
      // only matters once the photo is ready), a second ready cover is not.
      expect(succeeded(await insertPhoto(VISITS.v1InProgress, "cover-a", { cover: true }))).toBe(
        true,
      );
      expect(succeeded(await insertPhoto(VISITS.v1InProgress, "cover-b", { cover: true }))).toBe(
        true,
      );
      const second = await insertPhoto(VISITS.v1InProgress, "cover-c", {
        cover: true,
        status: "ready",
      });
      expect(second.ok).toBe(false);
      expect(!second.ok && second.code).toBe("23505");

      // Promoting a pending cover while a ready cover exists is refused as well.
      const promote = await attempt(
        client,
        "update public.photos set upload_status = 'ready' where storage_path = $1",
        [`${VISITS.v1InProgress}/cover-a.jpg`],
      );
      expect(promote.ok).toBe(false);
      expect(!promote.ok && promote.code).toBe("23505");

      // Without the cover flag the promotion goes through.
      const promoteB = await attempt(
        client,
        "update public.photos set upload_status = 'ready', is_cover = false where storage_path = $1",
        [`${VISITS.v1InProgress}/cover-b.jpg`],
      );
      expect(succeeded(promoteB)).toBe(true);
    });
  });
});

describe("private.purge_stale_pending_photos", () => {
  it("deletes only the pending photos older than max_age and returns their paths", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      expect(
        succeeded(await insertPhoto(VISITS.v1InProgress, "old-pending", { ageHours: 30 })),
      ).toBe(true);
      expect(
        succeeded(
          await insertPhoto(VISITS.v1InProgress, "old-ready", { ageHours: 30, status: "ready" }),
        ),
      ).toBe(true);
      expect(succeeded(await insertPhoto(VISITS.v1InProgress, "fresh-pending"))).toBe(true);

      await actAs(client, ACTORS.service);
      const purged = await attempt(
        client,
        "select id, storage_path, thumb_path from private.purge_stale_pending_photos(interval '24 hours') order by storage_path",
      );
      expect(purged.ok).toBe(true);
      const paths = purged.ok ? purged.rows.map((row) => row.storage_path) : [];
      expect(paths).toContain(`${VISITS.v1InProgress}/old-pending.jpg`);
      expect(paths).not.toContain(`${VISITS.v1InProgress}/old-ready.jpg`);
      expect(paths).not.toContain(`${VISITS.v1InProgress}/fresh-pending.jpg`);
      const row = purged.ok
        ? purged.rows.find((r) => r.storage_path === `${VISITS.v1InProgress}/old-pending.jpg`)
        : undefined;
      expect(row?.thumb_path).toBe(`${VISITS.v1InProgress}/old-pending_thumb.jpg`);

      await client.query("reset role");
      const { rows } = await client.query<{ storage_path: string }>(
        "select storage_path from public.photos where visit_id = $1 and storage_path like '%pending.jpg' order by storage_path",
        [VISITS.v1InProgress],
      );
      expect(rows.map((r) => r.storage_path)).toEqual([`${VISITS.v1InProgress}/fresh-pending.jpg`]);
    });
  });

  it("purges every pending photo with a zero max_age and nothing when there is none", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      const first = await attempt(
        client,
        "select count(*)::int as count from private.purge_stale_pending_photos(interval '0')",
      );
      expect(first.ok).toBe(true);
      const second = await attempt(
        client,
        "select count(*)::int as count from private.purge_stale_pending_photos(interval '0')",
      );
      expect(second.ok && second.rows[0]!.count).toBe(0);
    });
  });

  it("is reserved to service_role: authenticated users and anon cannot call it", async () => {
    await inTransaction(client, async () => {
      for (const actor of [ACTORS.alice, ACTORS.david, ACTORS.anon]) {
        await actAs(client, actor);
        const result = await attempt(
          client,
          "select * from private.purge_stale_pending_photos(interval '0')",
        );
        expect(result.ok).toBe(false);
        expect(!result.ok && result.code).toBe("42501");
      }
    });
  });
});
