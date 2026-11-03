import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("applies defaults when everything is absent", () => {
    const env = parseEnv({});
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("RONDE");
    expect(env.NODE_ENV).toBe("development");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("treats empty strings as absent", () => {
    const env = parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("accepts well-formed Supabase variables", () => {
    const env = parseEnv({
      NEXT_PUBLIC_APP_NAME: "RONDE (test)",
      NEXT_PUBLIC_SUPABASE_URL: "https://example-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key-for-tests-only-0000",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-for-tests-only-0000",
    });
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("RONDE (test)");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example-project.supabase.co");
  });

  it("rejects a malformed URL with an explicit message", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "pas-une-url" })).toThrow(EnvValidationError);
    expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "pas-une-url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "ftp://example.org" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects an obviously truncated key", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "abc" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => parseEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});

describe("parseEnv cross validation of the auth provider", () => {
  const localOk = {
    AUTH_PROVIDER: "local",
    ALLOW_LOCAL_AUTH: "true",
    LOCAL_AUTH_SECRET: "x".repeat(32),
    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/ronde_test",
  };

  it("defaults to supabase and tolerates missing database settings", () => {
    const env = parseEnv({});
    expect(env.AUTH_PROVIDER).toBe("supabase");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_POOL_MAX).toBe(5);
    expect(env.ALLOW_LOCAL_AUTH).toBe(false);
  });

  it("accepts a complete local configuration", () => {
    const env = parseEnv(localOk);
    expect(env.AUTH_PROVIDER).toBe("local");
    expect(env.ALLOW_LOCAL_AUTH).toBe(true);
  });

  it("refuses local without ALLOW_LOCAL_AUTH=true", () => {
    expect(() => parseEnv({ ...localOk, ALLOW_LOCAL_AUTH: "false" })).toThrow(/ALLOW_LOCAL_AUTH/);
    expect(() => parseEnv({ ...localOk, ALLOW_LOCAL_AUTH: undefined })).toThrow(/ALLOW_LOCAL_AUTH/);
  });

  it("refuses local without a long enough secret", () => {
    expect(() => parseEnv({ ...localOk, LOCAL_AUTH_SECRET: "court" })).toThrow(/LOCAL_AUTH_SECRET/);
    expect(() => parseEnv({ ...localOk, LOCAL_AUTH_SECRET: undefined })).toThrow(
      /LOCAL_AUTH_SECRET/,
    );
  });

  it("refuses local on Vercel", () => {
    expect(() => parseEnv({ ...localOk, VERCEL: "1" })).toThrow(/interdit sur Vercel/);
  });

  it("refuses local with a remote or missing database", () => {
    expect(() =>
      parseEnv({ ...localOk, DATABASE_URL: "postgres://u:p@db.example.supabase.co:6543/postgres" }),
    ).toThrow(/localhost/);
    expect(() => parseEnv({ ...localOk, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("validates DATABASE_URL and DATABASE_POOL_MAX formats", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_POOL_MAX: "0" })).toThrow(/DATABASE_POOL_MAX/);
    expect(parseEnv({ DATABASE_POOL_MAX: "12" }).DATABASE_POOL_MAX).toBe(12);
  });
});

describe("parseEnv cross validation of the storage provider", () => {
  const localOk = {
    STORAGE_PROVIDER: "local",
    ALLOW_LOCAL_STORAGE: "true",
    LOCAL_STORAGE_SECRET: "s".repeat(32),
    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/ronde_test",
  };

  it("defaults to supabase and the .storage folder", () => {
    const env = parseEnv({});
    expect(env.STORAGE_PROVIDER).toBe("supabase");
    expect(env.ALLOW_LOCAL_STORAGE).toBe(false);
    expect(env.LOCAL_STORAGE_SECRET).toBeUndefined();
    expect(env.LOCAL_STORAGE_DIR).toBe(".storage");
  });

  it("accepts a complete local configuration and a custom folder", () => {
    const env = parseEnv({ ...localOk, LOCAL_STORAGE_DIR: "/tmp/ronde-storage" });
    expect(env.STORAGE_PROVIDER).toBe("local");
    expect(env.LOCAL_STORAGE_DIR).toBe("/tmp/ronde-storage");
    expect(parseEnv({ ...localOk, LOCAL_STORAGE_DIR: "" }).LOCAL_STORAGE_DIR).toBe(".storage");
  });

  it("refuses local without ALLOW_LOCAL_STORAGE=true or without a long enough secret", () => {
    expect(() => parseEnv({ ...localOk, ALLOW_LOCAL_STORAGE: "false" })).toThrow(
      /ALLOW_LOCAL_STORAGE/,
    );
    expect(() => parseEnv({ ...localOk, LOCAL_STORAGE_SECRET: "court" })).toThrow(
      /LOCAL_STORAGE_SECRET/,
    );
    expect(() => parseEnv({ ...localOk, LOCAL_STORAGE_SECRET: undefined })).toThrow(
      /LOCAL_STORAGE_SECRET/,
    );
  });

  it("refuses local on Vercel and against a remote database", () => {
    expect(() => parseEnv({ ...localOk, VERCEL: "1" })).toThrow(/interdit sur Vercel/);
    expect(() =>
      parseEnv({ ...localOk, DATABASE_URL: "postgres://u:p@db.example.supabase.co:5432/postgres" }),
    ).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...localOk, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("does not require the storage variables under the supabase provider", () => {
    expect(() => parseEnv({ STORAGE_PROVIDER: "supabase", VERCEL: "1" })).not.toThrow();
    expect(() => parseEnv({ STORAGE_PROVIDER: "s3" })).toThrow(/STORAGE_PROVIDER/);
  });
});
