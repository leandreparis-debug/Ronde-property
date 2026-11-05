import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  confirmTyped,
  parseArgs,
  projectRefOf,
  redact,
  resolveTarget,
} from "../../scripts/ops/lib/target.mjs";

const REF = "abcdefghijklmnopqrst";
const OTHER = "zyxwvutsrqponmlkjihg";
const DIRECT = `postgresql://postgres:secret@db.${REF}.supabase.co:5432/postgres`;
const POOLER = `postgresql://postgres.${REF}:secret@aws-0-eu-west-3.pooler.supabase.com:6543/postgres`;
const LOCAL = "postgres://postgres:postgres@127.0.0.1:5432/ronde_test";

describe("ops target guard", () => {
  it("parses flags and values", () => {
    expect(parseArgs(["--project-ref", REF, "--apply", "--months=12"])).toEqual({
      _: [],
      "project-ref": REF,
      apply: true,
      months: "12",
    });
  });

  it("reads the project ref of a direct or pooled connection", () => {
    expect(projectRefOf(DIRECT)).toBe(REF);
    expect(projectRefOf(POOLER)).toBe(REF);
    expect(projectRefOf(LOCAL)).toBeNull();
    expect(
      projectRefOf(`postgresql://postgres.${REF}:x@evil.example.com:6543/postgres`),
    ).toBeNull();
  });

  it("accepts only the announced project", () => {
    expect(resolveTarget({ "project-ref": REF }, DIRECT)).toMatchObject({ kind: "supabase" });
    expect(resolveTarget({ "project-ref": REF }, POOLER).confirmation).toBe(REF);
    expect(() => resolveTarget({ "project-ref": OTHER }, DIRECT)).toThrow(/Cible refusée/);
    expect(() => resolveTarget({}, DIRECT)).toThrow(/Indiquer la cible/);
    expect(() => resolveTarget({ "project-ref": REF }, undefined)).toThrow(/DATABASE_URL/);
    expect(() => resolveTarget({ "project-ref": REF, local: true }, DIRECT)).toThrow(
      /pas les deux/,
    );
  });

  it("accepts --local only for ronde_test on localhost", () => {
    expect(resolveTarget({ local: true }, LOCAL)).toMatchObject({ kind: "local" });
    expect(() => resolveTarget({ local: true }, DIRECT)).toThrow(/ronde_test sur localhost/);
    expect(() =>
      resolveTarget({ local: true }, "postgres://postgres:postgres@127.0.0.1:5432/ronde_prod"),
    ).toThrow(/ronde_test/);
  });

  it("never prints the password", () => {
    expect(redact(DIRECT)).not.toContain("secret");
  });

  it("confirms only on the exact phrase", async () => {
    const answer = (text: string) =>
      confirmTyped(REF, { input: Readable.from([`${text}\n`]), output: { write: () => true } });
    expect(await answer(REF)).toBe(true);
    expect(await answer(` ${REF} `)).toBe(true);
    expect(await answer("oui")).toBe(false);
    expect(await answer(OTHER)).toBe(false);
  });
});
