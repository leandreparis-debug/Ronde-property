import { describe, expect, it } from "vitest";

import { AUDIT_ACTION_LABELS, auditActionLabel } from "@/server/services/audit-log";

describe("auditActionLabel", () => {
  it("labels known actions in French and falls back to the raw action", () => {
    expect(auditActionLabel("auth.signed_in")).toBe("Connexion");
    expect(auditActionLabel("account.created")).toBe("Compte créé");
    expect(auditActionLabel("x.unknown")).toBe("x.unknown");
    for (const label of Object.values(AUDIT_ACTION_LABELS)) expect(label).toMatch(/\S/);
  });
});
