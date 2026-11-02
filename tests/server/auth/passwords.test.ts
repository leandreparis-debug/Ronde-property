import { describe, expect, it } from "vitest";

import {
  generateTemporaryPassword,
  hashEmail,
  newPasswordSchema,
  normalizeEmail,
  PASSWORD_RULES,
  satisfiesPasswordPolicy,
  TEMPORARY_PASSWORD_ALPHABET,
} from "@/server/auth/passwords";

describe("generateTemporaryPassword", () => {
  it("produces 16 characters from the unambiguous alphabet that satisfy the policy", () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(16);
      for (const char of password) expect(TEMPORARY_PASSWORD_ALPHABET).toContain(char);
      expect(password).not.toMatch(/[0O1lI]/);
      expect(satisfiesPasswordPolicy(password)).toBe(true);
    }
  });

  it("has enough entropy: no duplicate in 1 000 draws and every symbol appears", () => {
    const draws = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const password = generateTemporaryPassword();
      draws.add(password);
      for (const char of password) seen.add(char);
    }
    expect(draws.size).toBe(1000);
    expect(seen.size).toBe(TEMPORARY_PASSWORD_ALPHABET.length);
    // 55 symbols × 16 positions ≈ 92 bits.
    expect(Math.log2(TEMPORARY_PASSWORD_ALPHABET.length) * 16).toBeGreaterThan(90);
  });
});

describe("password policy", () => {
  it("lists three rules shown to the user", () => {
    expect(PASSWORD_RULES.map((rule) => rule.key)).toEqual(["length", "letter", "digit"]);
  });

  it.each([
    ["Ronde-test-2026", true],
    ["abcdefghijk1", true],
    ["abcdefghijkl", false],
    ["123456789012", false],
    ["Court-1", false],
    ["", false],
  ])("%s → %s", (password, expected) => {
    expect(satisfiesPasswordPolicy(password)).toBe(expected);
    expect(newPasswordSchema.safeParse(password).success).toBe(expected);
  });
});

describe("emails", () => {
  it("normalises and hashes without exposing the address", () => {
    expect(normalizeEmail("  RT.Alice@Example.TEST ")).toBe("rt.alice@example.test");
    const hash = hashEmail("RT.Alice@example.test");
    expect(hash).toBe(hashEmail("rt.alice@example.test"));
    expect(hash).toHaveLength(16);
    expect(hash).not.toMatch(/alice|example/);
  });
});
