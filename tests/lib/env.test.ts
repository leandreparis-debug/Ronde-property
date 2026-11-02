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
