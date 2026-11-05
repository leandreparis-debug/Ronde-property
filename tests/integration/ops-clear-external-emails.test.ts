import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/ops/clear-external-emails.mjs";
const LOCAL = "postgres://postgres:postgres@127.0.0.1:5432/ronde_test";

function run(args: string[], input = "", databaseUrl = LOCAL) {
  const result = spawnSync("node", [SCRIPT, ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("scripts/ops/clear-external-emails.mjs", () => {
  it("simulates by default on the local database", () => {
    const { code, out } = run(["--local"]);
    expect(code).toBe(0);
    expect(out).toContain("Cible : base locale ronde_test");
    expect(out).toMatch(/Adresses concernées : \d+\./);
    expect(out).toContain("SIMULATION");
    expect(out).not.toContain("postgres:postgres@");
  });

  it("refuses a target that is not the announced one, before connecting", () => {
    const wrong = run(
      ["--project-ref", "abcdefghijklmnopqrst"],
      "",
      "postgresql://postgres:x@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres",
    );
    expect(wrong.code).toBe(1);
    expect(wrong.out).toContain("Cible refusée");
    expect(run([]).out).toContain("Indiquer la cible");
    expect(run(["--local", "--months", "0"]).out).toContain("--months");
  });

  it("asks for the typed confirmation before writing", () => {
    const { code, out } = run(["--local", "--apply", "--months", "1"], "non\n");
    expect([0, 2]).toContain(code);
    expect(out).toMatch(/Rien à effacer|Confirmation incorrecte/);
  });
});
