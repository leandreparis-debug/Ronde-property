import { describe, expect, it } from "vitest";

import {
  RESERVE_PRIORITIES,
  RESERVE_PRIORITY_LABELS,
  RESERVE_STATUS_LABELS,
  RESERVE_STATUSES,
  USER_ROLE_LABELS,
  USER_ROLES,
  VISIT_REASON_LABELS,
  VISIT_REASONS,
} from "@/server/domain/enums";

describe("enum labels", () => {
  it("labels reserve priorities as Basse, Normale, Haute, Urgente", () => {
    expect(RESERVE_PRIORITIES.map((p) => RESERVE_PRIORITY_LABELS[p])).toEqual([
      "Basse",
      "Normale",
      "Haute",
      "Urgente",
    ]);
  });

  it("labels reserve statuses as Ouverte, En cours, Levée", () => {
    expect(RESERVE_STATUSES.map((s) => RESERVE_STATUS_LABELS[s])).toEqual([
      "Ouverte",
      "En cours",
      "Levée",
    ]);
  });

  it("has a non-empty French label for every value", () => {
    for (const role of USER_ROLES) expect(USER_ROLE_LABELS[role]).toMatch(/\S/);
    for (const reason of VISIT_REASONS) expect(VISIT_REASON_LABELS[reason]).toMatch(/\S/);
  });
});
