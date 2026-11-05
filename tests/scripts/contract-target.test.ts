import { describe, expect, it } from "vitest";

import { checkContractTarget, projectRefOfApiUrl } from "../../scripts/ops/lib/contract-target.mjs";

const TEST = "testtesttesttesttest";
const PROD = "prodprodprodprodprod";

const env = (overrides: Record<string, string | undefined> = {}) => ({
  RONDE_CONTRACT_TARGET: "test",
  SUPABASE_TEST_URL: `https://${TEST}.supabase.co`,
  SUPABASE_TEST_ANON_KEY: "anon",
  SUPABASE_TEST_SERVICE_ROLE_KEY: "service",
  DATABASE_URL: `postgresql://postgres.${TEST}:x@aws-0-eu-west-3.pooler.supabase.com:6543/postgres`,
  SUPABASE_PROD_PROJECT_REF: PROD,
  ...overrides,
});

describe("pnpm test:contract guard", () => {
  it("accepts the test project", () => {
    expect(checkContractTarget(env())).toBe(TEST);
    expect(projectRefOfApiUrl(`https://${TEST}.supabase.co/`)).toBe(TEST);
  });

  it("refuses without RONDE_CONTRACT_TARGET=test", () => {
    expect(() => checkContractTarget(env({ RONDE_CONTRACT_TARGET: undefined }))).toThrow(
      /RONDE_CONTRACT_TARGET=test/,
    );
    expect(() => checkContractTarget(env({ RONDE_CONTRACT_TARGET: "prod" }))).toThrow(/Refus/);
  });

  it("refuses the production project", () => {
    expect(() =>
      checkContractTarget(
        env({
          SUPABASE_TEST_URL: `https://${PROD}.supabase.co`,
          DATABASE_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres`,
        }),
      ),
    ).toThrow(/PRODUCTION/);
  });

  it("refuses missing variables and two different projects", () => {
    expect(() => checkContractTarget(env({ SUPABASE_TEST_ANON_KEY: undefined }))).toThrow(
      /SUPABASE_TEST_ANON_KEY/,
    );
    expect(() =>
      checkContractTarget(
        env({ DATABASE_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres` }),
      ),
    ).toThrow(/même projet/);
    expect(() =>
      checkContractTarget(
        env({ DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/ronde_test" }),
      ),
    ).toThrow(/même projet/);
  });
});
