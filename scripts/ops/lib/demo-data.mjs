/**
 * Demo data of RONDE (the fictitious seed, `supabase/seed.sql`) and its removal before the
 * go-live. Used by scripts/ops/purge-demo-data.mjs.
 *
 * Demo data:
 *   - accounts whose e-mail ends with `@example.test` (seed domain), except the kept admin;
 *   - sites whose code starts with `TEST-`;
 *   - visits on those sites or created by those accounts, with everything attached to them.
 * Anything else is « unknown »: the purge refuses to run unless `--keep-unknown` is given, and
 * never deletes it.
 */

export const DEMO_EMAIL_DOMAIN = "@example.test";
export const DEMO_SITE_PREFIX = "TEST-";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Temporary tables of the demo rows, filled in the purge transaction. The only value inserted
 * in the text is the kept admin id, checked as a UUID first (constants otherwise).
 */
function selectSets(keepAdminId) {
  if (!UUID.test(keepAdminId)) throw new Error("Identifiant du compte conservé invalide.");
  return [
    `create temporary table demo_profiles on commit drop as
       select id from public.profiles
       where lower(email) like '%${DEMO_EMAIL_DOMAIN}' and id <> '${keepAdminId}'::uuid`,
    `create temporary table demo_sites on commit drop as
       select id from public.sites where warehouse_code like '${DEMO_SITE_PREFIX}%'`,
    `create temporary table demo_visits on commit drop as
       select id from public.visits
       where site_id in (select id from demo_sites) or created_by in (select id from demo_profiles)`,
    `create temporary table demo_reserves on commit drop as
       select id from public.reserves
       where visit_id in (select id from demo_visits) or site_id in (select id from demo_sites)`,
    `create temporary table demo_photos on commit drop as
       select id from public.photos where visit_id in (select id from demo_visits)`,
    `create temporary table demo_plans on commit drop as
       select id from public.site_plans where site_id in (select id from demo_sites)`,
  ];
}

/**
 * Deletion order (children first). Triggers are paused for the transaction
 * (`session_replication_role = replica`): the append-only tables and the never-deleted profiles
 * are reached, and foreign keys are not checked, hence the explicit order and the final check.
 */
export const DELETIONS = [
  [
    "reserve_events",
    "reserve_id in (select id from demo_reserves) or actor_id in (select id from demo_profiles)",
  ],
  [
    "reserve_photos",
    "reserve_id in (select id from demo_reserves) or photo_id in (select id from demo_photos)",
  ],
  [
    "plan_markers",
    "visit_id in (select id from demo_visits) or plan_id in (select id from demo_plans)",
  ],
  [
    "plan_marker_counters",
    "visit_id in (select id from demo_visits) or plan_id in (select id from demo_plans)",
  ],
  ["reserves", "id in (select id from demo_reserves)"],
  ["photos", "id in (select id from demo_photos)"],
  ["reports", "visit_id in (select id from demo_visits)"],
  ["visit_zone_notes", "visit_id in (select id from demo_visits)"],
  ["visit_participants", "visit_id in (select id from demo_visits)"],
  ["visits", "id in (select id from demo_visits)"],
  ["site_plan_pages", "plan_id in (select id from demo_plans)"],
  ["site_plans", "id in (select id from demo_plans)"],
  ["sites", "id in (select id from demo_sites)"],
  ["feedback", "author_id in (select id from demo_profiles)"],
  ["sync_operations", "user_id in (select id from demo_profiles)"],
  ["site_import_runs", "performed_by in (select id from demo_profiles)"],
  ["audit_log", "actor_id in (select id from demo_profiles)"],
  ["profiles", "id in (select id from demo_profiles)"],
];

/** Every foreign key of the schema, checked after the deletions (no orphan allowed). */
export const FOREIGN_KEYS_SQL = `
select c.conrelid::regclass::text as child, a.attname as column_name,
       c.confrelid::regclass::text as parent, pa.attname as parent_column
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  and c.confrelid::regclass::text not like 'auth.%'
`;

/** Reads what the purge would do, inside an open transaction (read only). */
export async function planPurge(client, { keepAdminId }) {
  for (const statement of selectSets(keepAdminId)) await client.query(statement);
  const counts = {};
  for (const [table, where] of DELETIONS) {
    const { rows } = await client.query(
      `select count(*)::int as n from public.${table} where ${where}`,
    );
    counts[table] = rows[0].n;
  }
  const unknownProfiles = await client.query(
    `select id, full_name, role from public.profiles
     where id not in (select id from demo_profiles) and id <> $1::uuid order by full_name`,
    [keepAdminId],
  );
  const unknownSites = await client.query(
    `select warehouse_code, name from public.sites
     where id not in (select id from demo_sites) order by warehouse_code`,
  );
  // Real rows that depend on demo rows: the purge would orphan or delete them.
  const blocking = await client.query(`
    select 'visite ' || v.title as label from public.visits v
    where v.id in (select id from demo_visits)
      and v.created_by not in (select id from demo_profiles)
      and v.site_id not in (select id from demo_sites)
    union all
    select 'visite ' || v.title from public.visits v
    where v.id not in (select id from demo_visits)
      and (v.writer_id in (select id from demo_profiles) or v.updated_by in (select id from demo_profiles)
           or v.completed_by in (select id from demo_profiles))
    union all
    select 'réserve n°' || r.number from public.reserves r
    where r.id not in (select id from demo_reserves)
      and (r.created_by in (select id from demo_profiles) or r.closed_by in (select id from demo_profiles)
           or r.responsible_profile_id in (select id from demo_profiles))
    union all
    select 'plan ' || p.name from public.site_plans p
    where p.id not in (select id from demo_plans) and p.uploaded_by in (select id from demo_profiles)
    union all
    select 'rapport ' || r.file_name from public.reports r
    where r.visit_id not in (select id from demo_visits) and r.generated_by in (select id from demo_profiles)
  `);
  const files = await client.query(`
    select 'visit-photos' as bucket, storage_path as path from public.photos where id in (select id from demo_photos)
    union all select 'visit-photos', thumb_path from public.photos where id in (select id from demo_photos) and thumb_path is not null
    union all select 'reports', storage_path from public.reports where visit_id in (select id from demo_visits)
    union all select 'site-plans', storage_path from public.site_plans where id in (select id from demo_plans)
    union all select 'site-plans', image_path from public.site_plan_pages where plan_id in (select id from demo_plans)
    union all select 'site-plans', thumb_path from public.site_plan_pages where plan_id in (select id from demo_plans) and thumb_path is not null
  `);
  const accounts = await client.query("select id from demo_profiles");
  return {
    counts,
    unknownProfiles: unknownProfiles.rows,
    unknownSites: unknownSites.rows,
    blocking: blocking.rows.map((row) => row.label),
    files: files.rows,
    accountIds: accounts.rows.map((row) => row.id),
  };
}

/**
 * Deletes the demo rows inside the open transaction, then checks every foreign key of the
 * schema; throws (so that the caller rolls back) if any row points to a deleted one.
 */
export async function deleteDemoRows(client) {
  await client.query("set local session_replication_role = replica");
  const deleted = {};
  for (const [table, where] of DELETIONS) {
    const result = await client.query(`delete from public.${table} where ${where}`);
    deleted[table] = result.rowCount;
  }
  await client.query("set local session_replication_role = origin");
  const { rows: keys } = await client.query(FOREIGN_KEYS_SQL);
  const orphans = [];
  for (const key of keys) {
    const { rows } = await client.query(
      `select count(*)::int as n from ${key.child} c
       where c.${key.column_name} is not null
         and not exists (select 1 from ${key.parent} p where p.${key.parent_column} = c.${key.column_name})`,
    );
    if (rows[0].n > 0)
      orphans.push(`${key.child}.${key.column_name} → ${key.parent} (${rows[0].n})`);
  }
  if (orphans.length > 0) {
    throw new Error(`Références orphelines, annulation complète : ${orphans.join(" ; ")}`);
  }
  return deleted;
}
