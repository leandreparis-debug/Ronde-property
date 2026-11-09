import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Client, connect } from "./helpers";

/*
 * Automatic RLS audit (step 11): structural rules every table, view and function of the schema
 * must follow. A new table or view that breaks one of them fails here, whatever its policies.
 */

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

/** Tables written only by the service (no policy on purpose: RLS denies everything else). */
const SERVICE_ONLY_TABLES = ["plan_marker_counters", "sync_operations"];

async function rows<T>(query: string): Promise<T[]> {
  return (await client.query<T & Record<string, unknown>>(query)).rows;
}

describe("RLS audit", () => {
  it("enables RLS on every table of public (and storage.objects)", async () => {
    const missing = await rows<{ name: string }>(`
      select n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and not c.relrowsecurity
        and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))`);
    expect(missing).toEqual([]);
  });

  it("gives every table at least one policy, except the service-only ones", async () => {
    const withoutPolicy = await rows<{ name: string }>(`
      select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = c.relname)
      order by 1`);
    expect(withoutPolicy.map((row) => row.name)).toEqual(SERVICE_ONLY_TABLES);
  });

  it("grants nothing on the service-only tables to signed-in users", async () => {
    const grants = await rows<{ table_name: string }>(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and table_name = any (array[${SERVICE_ONLY_TABLES.map((t) => `'${t}'`).join(",")}])`);
    expect(grants).toEqual([]);
  });

  it("writes policies for `authenticated` only: none for anon or public", async () => {
    const policies = await rows<{ name: string }>(`
      select tablename || '.' || policyname as name from pg_policies
      where schemaname in ('public', 'storage')
        and not (roles <@ array['authenticated']::name[])`);
    expect(policies).toEqual([]);
  });

  it("never opens a table to everyone with a `true` policy", async () => {
    const open = await rows<{ name: string }>(`
      select tablename || '.' || policyname as name from pg_policies
      where schemaname = 'public'
        and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true')`);
    expect(open).toEqual([]);
  });

  it("gives anon no privilege on any table or view of public", async () => {
    const grants = await rows<{ name: string }>(`
      select distinct table_name || ':' || privilege_type as name
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'`);
    expect(grants).toEqual([]);
  });

  it("never lets signed-in users truncate (TRUNCATE ignores RLS)", async () => {
    const grants = await rows<{ name: string }>(`
      select table_name as name from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'TRUNCATE'`);
    expect(grants).toEqual([]);
  });

  it("makes every view run with the rights of the caller and read-only", async () => {
    const views = await rows<{ name: string; options: string[] | null }>(`
      select c.relname as name, c.reloptions as options
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm')`);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(view.options ?? [], view.name).toContain("security_invoker=true");
    }
    const writes = await rows<{ name: string }>(`
      select g.table_name || ':' || g.privilege_type as name
      from information_schema.role_table_grants g
      join information_schema.views v
        on v.table_schema = g.table_schema and v.table_name = g.table_name
      where g.table_schema = 'public' and g.grantee = 'authenticated'
        and g.privilege_type <> 'SELECT'`);
    expect(writes).toEqual([]);
  });

  it("pins the search_path of every SECURITY DEFINER function", async () => {
    const unsafe = await rows<{ name: string }>(`
      select n.nspname || '.' || p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting
                        where setting like 'search_path=%')`);
    expect(unsafe).toEqual([]);
  });

  it("keeps SECURITY DEFINER functions of public out of anon's reach", async () => {
    const callable = await rows<{ name: string }>(`
      select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and has_function_privilege('anon', p.oid, 'execute')`);
    expect(callable).toEqual([]);
  });

  it("keeps the email and the revocation date of profiles hidden from signed-in users", async () => {
    const columns = await rows<{ column_name: string }>(`
      select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'profiles'
        and grantee = 'authenticated' and privilege_type = 'SELECT'
      order by 1`);
    const names = columns.map((row) => row.column_name);
    expect(names).not.toContain("email");
    expect(names).not.toContain("sessions_revoked_at");
  });
});
