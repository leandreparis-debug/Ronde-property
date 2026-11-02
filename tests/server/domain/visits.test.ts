import { describe, expect, it } from "vitest";

import { visitInputSchema, visitUpdateSchema } from "@/server/domain/schemas";
import {
  defaultReasonFor,
  incompletePoints,
  isReasonAllowed,
  suggestVisitTitle,
  visitDateWarning,
} from "@/server/domain/visits";
import { VISIT_REASON_LABELS } from "@/server/domain/labels";
import { todayInParis } from "@/lib/format";

const SITE = "10000000-0000-4000-8000-000000000001";

describe("type / reason rule", () => {
  it("allows the five technical reasons and only « meeting » for a meeting", () => {
    expect(isReasonAllowed("technical", "periodic")).toBe(true);
    expect(isReasonAllowed("technical", "meeting")).toBe(false);
    expect(isReasonAllowed("meeting", "meeting")).toBe(true);
    expect(isReasonAllowed("meeting", "periodic")).toBe(false);
    expect(defaultReasonFor("meeting")).toBe("meeting");
    expect(defaultReasonFor("technical")).toBe("periodic");
  });

  it("is enforced by the creation and update schemas with a field message", () => {
    const base = { siteId: SITE, title: "Réunion", visitDate: "2026-11-02" };
    const invalid = visitInputSchema.safeParse({ ...base, type: "meeting", reason: "periodic" });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.path).toEqual(["reason"]);
    expect(
      visitInputSchema.safeParse({ ...base, type: "meeting", reason: "meeting" }).success,
    ).toBe(true);
    expect(
      visitInputSchema.safeParse({ ...base, type: "technical", reason: "meeting" }).success,
    ).toBe(false);
    expect(
      visitUpdateSchema.safeParse({
        type: "technical",
        reason: "post_claim",
        title: "x",
        visitDate: "2026-01-01",
        subject: null,
        writerId: null,
      }).success,
    ).toBe(true);
  });

  it("validates lengths and dates", () => {
    const base = { siteId: SITE, visitDate: "2026-11-02" };
    expect(visitInputSchema.safeParse({ ...base, title: "" }).success).toBe(false);
    expect(visitInputSchema.safeParse({ ...base, title: "x".repeat(201) }).success).toBe(false);
    expect(
      visitInputSchema.safeParse({ ...base, title: "ok", visitDate: "02/11/2026" }).success,
    ).toBe(false);
    expect(
      visitInputSchema.safeParse({ ...base, title: "ok", subject: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(
      visitInputSchema.safeParse({ siteId: "nope", title: "ok", visitDate: "2026-11-02" }).success,
    ).toBe(false);
  });
});

describe("suggestVisitTitle", () => {
  it("builds « {Motif} — {site} » and falls back to the reason alone", () => {
    expect(suggestVisitTitle("periodic", "Entrepôt fictif Lyon Sud")).toBe(
      "Visite périodique — Entrepôt fictif Lyon Sud",
    );
    expect(suggestVisitTitle("lease_negotiation", null)).toBe("Avant négociation de bail");
    expect(suggestVisitTitle("meeting", "x".repeat(300))).toHaveLength(200);
  });

  it("has the expected French reason labels", () => {
    expect(Object.values(VISIT_REASON_LABELS)).toEqual([
      "Visite périodique",
      "Avant négociation de bail",
      "Après sinistre",
      "Entrée de locataire",
      "Sortie de locataire",
      "Réunion",
    ]);
  });
});

describe("visitDateWarning", () => {
  it("warns beyond one year in the past or the future, never otherwise", () => {
    expect(visitDateWarning("2026-11-02", "2026-11-02")).toBeNull();
    expect(visitDateWarning("2025-11-05", "2026-11-02")).toBeNull();
    expect(visitDateWarning("2025-10-01", "2026-11-02")).toMatch(/passé/);
    expect(visitDateWarning("2027-12-25", "2026-11-02")).toMatch(/futur/);
    expect(visitDateWarning("n/a", "2026-11-02")).toBeNull();
  });
});

describe("incompletePoints", () => {
  it("lists the missing writer, participants and subject with anchors", () => {
    expect(
      incompletePoints({ writerId: null, subject: "  ", participantsCount: 0 }).map((p) => p.key),
    ).toEqual(["writer", "participants", "subject"]);
    expect(incompletePoints({ writerId: "x", subject: "Objet", participantsCount: 2 })).toEqual([]);
    expect(
      incompletePoints({ writerId: "x", subject: null, participantsCount: 1 })[0]?.anchor,
    ).toBe("visit-subject");
  });

  it("adds « Aucune observation saisie » when every zone is empty, linking to the notes tab", () => {
    const base = { writerId: "x", subject: "Objet", participantsCount: 1 };
    expect(incompletePoints({ ...base, filledZonesCount: 0 })).toEqual([
      { key: "notes", label: "Aucune observation saisie", anchor: "notes", href: "?onglet=notes" },
    ]);
    expect(incompletePoints({ ...base, filledZonesCount: 3 })).toEqual([]);
    expect(incompletePoints(base)).toEqual([]);
  });
});

describe("todayInParis", () => {
  it("returns the Paris civil date, even around midnight", () => {
    expect(todayInParis(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-03");
    expect(todayInParis(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
    expect(todayInParis(new Date("2026-11-02T10:00:00Z"))).toBe("2026-11-02");
  });
});
