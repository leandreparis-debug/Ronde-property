import { describe, expect, it } from "vitest";

import { hasRole, safeNext } from "@/server/auth/session";
import type { CurrentUser } from "@/server/auth/types";

describe("safeNext", () => {
  it.each([
    ["/reserves", "/reserves"],
    ["/admin/comptes?page=2", "/admin/comptes?page=2"],
    ["https://exemple.com", "/"],
    ["//exemple.com", "/"],
    ["/\\exemple.com", "/"],
    ["reserves", "/"],
    ["/connexion?next=/x", "/"],
    ["/a\r\nLocation: x", "/"],
    ["", "/"],
    [null, "/"],
    [undefined, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("hasRole", () => {
  const user: CurrentUser = {
    id: "00000000-0000-4000-8000-000000000003",
    email: "direction.claire@example.test",
    fullName: "Claire Fictive",
    role: "direction",
    mustChangePassword: false,
  };

  it("checks the role of the user", () => {
    expect(hasRole(user, ["direction"])).toBe(true);
    expect(hasRole(user, ["rt", "admin"])).toBe(false);
    expect(hasRole(null, ["direction"])).toBe(false);
  });
});
