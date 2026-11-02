import pg from "pg";

/** Connection to the local test database. Refuses anything else, like db:reset. */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/ronde_test";

const url = new URL(DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/ronde_test") {
  throw new Error("Les tests de base ne s'exécutent que sur ronde_test en local.");
}

/** Fixed identifiers of the seed (supabase/seed.sql). */
export const USERS = {
  alice: "00000000-0000-4000-8000-000000000001", // rt, creator of V1
  bruno: "00000000-0000-4000-8000-000000000002", // rt, participant of V1, creator of V2
  claire: "00000000-0000-4000-8000-000000000003", // direction
  david: "00000000-0000-4000-8000-000000000004", // admin
  inactif: "00000000-0000-4000-8000-000000000005", // rt, inactive
  emma: "00000000-0000-4000-8000-000000000006", // rt, not involved in any visit
} as const;

export const SITES = {
  lyon: "10000000-0000-4000-8000-000000000001", // TEST-001, site of V1
  lille: "10000000-0000-4000-8000-000000000002", // TEST-002, site of V2
  marseille: "10000000-0000-4000-8000-000000000003",
  toulouse: "10000000-0000-4000-8000-000000000004", // used by the concurrency test (committed rows)
  rouenInactive: "10000000-0000-4000-8000-000000000012",
} as const;

export const VISITS = {
  v1InProgress: "20000000-0000-4000-8000-000000000001",
  v2Completed: "20000000-0000-4000-8000-000000000002",
  v3Deleted: "20000000-0000-4000-8000-000000000003",
} as const;

export const RESERVES = {
  r1Open: "50000000-0000-4000-8000-000000000001",
  r2InProgress: "50000000-0000-4000-8000-000000000002",
  r3Done: "50000000-0000-4000-8000-000000000003",
  r4Overdue: "50000000-0000-4000-8000-000000000004",
  r5External: "50000000-0000-4000-8000-000000000005",
} as const;

export const PHOTO_V1 = "60000000-0000-4000-8000-000000000001";
export const PLAN_LYON = "70000000-0000-4000-8000-000000000001";
export const MARKER_V1 = "80000000-0000-4000-8000-000000000001";
export const REPORT_V2 = "90000000-0000-4000-8000-000000000001";
export const PARTICIPANT_EXTERNAL_V1 = "30000000-0000-4000-8000-000000000003";

/** Who runs the statements: a Supabase role plus, for users, the JWT subject. */
export type Actor =
  { kind: "anon" } | { kind: "service" } | { kind: "postgres" } | { kind: "user"; id: string };

export const ACTORS = {
  anon: { kind: "anon" } as Actor,
  service: { kind: "service" } as Actor,
  postgres: { kind: "postgres" } as Actor,
  alice: { kind: "user", id: USERS.alice } as Actor,
  bruno: { kind: "user", id: USERS.bruno } as Actor,
  claire: { kind: "user", id: USERS.claire } as Actor,
  david: { kind: "user", id: USERS.david } as Actor,
  inactif: { kind: "user", id: USERS.inactif } as Actor,
  emma: { kind: "user", id: USERS.emma } as Actor,
} as const;

export type ActorName = keyof typeof ACTORS;

export type Client = pg.Client;

export async function connect(): Promise<Client> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

/** Switches the current transaction to the given actor (role and JWT claims). */
export async function actAs(client: Client, actor: Actor): Promise<void> {
  await client.query("reset role");
  switch (actor.kind) {
    case "anon":
      await client.query("select set_config('request.jwt.claims', '', true)");
      await client.query("set local role anon");
      break;
    case "service":
      await client.query("select set_config('request.jwt.claims', '', true)");
      await client.query("set local role service_role");
      break;
    case "postgres":
      await client.query("select set_config('request.jwt.claims', '', true)");
      break;
    case "user":
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.id, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
      break;
  }
}

/** Runs `fn` inside a transaction that is always rolled back. */
export async function inTransaction<T>(
  client: Client,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    return await fn(client);
  } finally {
    await client.query("rollback");
  }
}

export type Attempt =
  | { ok: true; rowCount: number; rows: Record<string, unknown>[] }
  | { ok: false; code: string; message: string };

/**
 * Runs a statement in a savepoint so that a failure does not abort the surrounding
 * transaction. Returns the outcome instead of throwing.
 */
export async function attempt(
  client: Client,
  sql: string,
  params: unknown[] = [],
): Promise<Attempt> {
  await client.query("savepoint attempt");
  try {
    const result = await client.query(sql, params);
    await client.query("release savepoint attempt");
    return { ok: true, rowCount: result.rowCount ?? 0, rows: result.rows };
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    const pgError = error as { code?: string; message: string };
    return { ok: false, code: pgError.code ?? "unknown", message: pgError.message };
  }
}

/** True when the statement succeeded and touched at least one row. */
export function succeeded(result: Attempt): boolean {
  return result.ok && result.rowCount >= 1;
}

/** True when the statement raised, or silently touched no row (RLS). */
export function denied(result: Attempt): boolean {
  return !result.ok || result.rowCount === 0;
}

/** Reads the audit log as postgres (bypasses RLS) within the current transaction. */
export async function auditActions(client: Client, entityId: string): Promise<string[]> {
  await client.query("reset role");
  const { rows } = await client.query<{ action: string }>(
    "select action from public.audit_log where entity_id = $1 order by id",
    [entityId],
  );
  return rows.map((row) => row.action);
}
