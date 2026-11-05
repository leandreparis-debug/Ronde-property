import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** True when git ignores the path (exit code 0 of `git check-ignore`). */
function ignored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", path]);
    return true;
  } catch {
    return false;
  }
}

describe("secrets hygiene", () => {
  it.each([
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".env.development",
    ".env.test",
    "e2e/.auth/alice.json",
  ])("git ignores %s", (path) => {
    expect(ignored(path)).toBe(true);
  });

  it("keeps the documented example tracked, without any value that looks real", () => {
    expect(ignored(".env.example")).toBe(false);
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // JWT (Supabase keys)
    expect(example).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/); // real project URL
    expect(example).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9]{10,}/);
  });

  it("tracks no .env file other than the example", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter((file) => /(^|\/)\.env/.test(file));
    expect(tracked).toEqual([".env.example"]);
  });
});
