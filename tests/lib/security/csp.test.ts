import { describe, expect, it } from "vitest";

import { buildCsp, createNonce, originOf } from "@/lib/security/csp";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name!, values];
    }),
  );
}

describe("buildCsp", () => {
  const csp = directives(
    buildCsp({ nonce: "abc123==", supabaseUrl: "https://projet-fictif.supabase.co/rest/v1" }),
  );

  it("only runs same-origin scripts carrying the nonce, without eval nor inline", () => {
    expect(csp.get("script-src")).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(csp.get("script-src")).not.toContain("'unsafe-inline'");
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows the Supabase origin for connections and images only", () => {
    expect(csp.get("connect-src")).toEqual([
      "'self'",
      "https://projet-fictif.supabase.co",
      "wss://projet-fictif.supabase.co",
    ]);
    expect(csp.get("img-src")).toEqual([
      "'self'",
      "blob:",
      "data:",
      "https://projet-fictif.supabase.co",
    ]);
    expect(csp.get("script-src")?.join(" ")).not.toContain("supabase");
  });

  it("forbids framing, plugins and foreign forms", () => {
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
  });

  it("works without Supabase (local providers) and adds eval only in development", () => {
    const local = directives(buildCsp({ nonce: "n" }));
    expect(local.get("connect-src")).toEqual(["'self'"]);
    const dev = directives(buildCsp({ nonce: "n", dev: true }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
  });
});

describe("helpers", () => {
  it("originOf ignores invalid URLs", () => {
    expect(originOf("pas une url")).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });

  it("createNonce returns 128 random bits", () => {
    const a = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });
});
