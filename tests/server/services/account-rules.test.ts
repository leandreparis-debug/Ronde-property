import { describe, expect, it } from "vitest";

import { ForbiddenError, ValidationError } from "@/server/errors";
import { assertAccountChangeAllowed, assertFullName } from "@/server/services/account-rules";

const DAVID = { id: "david", role: "admin", isActive: true } as const;
const OTHER_ADMIN = { id: "other", role: "admin", isActive: true } as const;
const ALICE = { id: "alice", role: "rt", isActive: true } as const;

describe("assertAccountChangeAllowed", () => {
  it("refuses deactivating oneself or dropping one's own admin role", () => {
    expect(() => assertAccountChangeAllowed("david", DAVID, { isActive: false }, 3)).toThrow(
      ForbiddenError,
    );
    expect(() => assertAccountChangeAllowed("david", DAVID, { role: "rt" }, 3)).toThrow(
      /propre rôle/,
    );
  });

  it("refuses deactivating or demoting the last active admin", () => {
    expect(() => assertAccountChangeAllowed("david", OTHER_ADMIN, { isActive: false }, 1)).toThrow(
      /dernier administrateur/,
    );
    expect(() =>
      assertAccountChangeAllowed("david", OTHER_ADMIN, { role: "direction" }, 1),
    ).toThrow(/dernier administrateur/);
  });

  it("allows the same changes when another active admin remains", () => {
    expect(() =>
      assertAccountChangeAllowed("david", OTHER_ADMIN, { isActive: false }, 2),
    ).not.toThrow();
    expect(() => assertAccountChangeAllowed("david", OTHER_ADMIN, { role: "rt" }, 2)).not.toThrow();
  });

  it("allows changes on non-admin accounts and promotions", () => {
    expect(() => assertAccountChangeAllowed("david", ALICE, { isActive: false }, 1)).not.toThrow();
    expect(() => assertAccountChangeAllowed("david", ALICE, { role: "admin" }, 1)).not.toThrow();
    expect(() =>
      assertAccountChangeAllowed("david", DAVID, { role: "admin", isActive: true }, 1),
    ).not.toThrow();
  });

  it("reactivating an inactive admin never counts as losing an admin", () => {
    expect(() =>
      assertAccountChangeAllowed(
        "david",
        { ...OTHER_ADMIN, isActive: false },
        { isActive: true },
        1,
      ),
    ).not.toThrow();
  });
});

describe("assertFullName", () => {
  it("trims and bounds the name", () => {
    expect(assertFullName("  Alice Fictive ")).toBe("Alice Fictive");
    expect(() => assertFullName("   ")).toThrow(ValidationError);
    expect(() => assertFullName("x".repeat(201))).toThrow(ValidationError);
  });
});
