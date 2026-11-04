import { describe, expect, it } from "vitest";

import {
  emptyReserveForm,
  reserveFormSchema,
  reserveToForm,
  toReserveWrite,
} from "@/lib/reserves/schema";

const PROFILE = "00000000-0000-4000-8000-000000000002";

function form(overrides: Partial<ReturnType<typeof emptyReserveForm>> = {}) {
  return { ...emptyReserveForm("docks"), action: "Remplacer les butoirs", ...overrides };
}

function fieldErrors(values: unknown): Record<string, string> {
  const result = reserveFormSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("reserveFormSchema", () => {
  it("accepts a minimal reserve « À désigner » with normal priority and no due date", () => {
    const result = reserveFormSchema.safeParse(form());
    expect(result.success).toBe(true);
    expect(toReserveWrite(result.data!)).toEqual({
      action: "Remplacer les butoirs",
      description: null,
      zoneKey: "docks",
      priority: "normal",
      dueDate: null,
      responsibleKind: null,
      responsibleProfileId: null,
      responsibleName: null,
      responsibleCompany: null,
      responsibleEmail: null,
    });
  });

  it("refuses an empty action and an action over 500 characters", () => {
    expect(fieldErrors(form({ action: "   " })).action).toBe("L'action est obligatoire.");
    expect(fieldErrors(form({ action: "x".repeat(501) })).action).toBe("500 caractères maximum.");
    expect(fieldErrors(form({ action: "x".repeat(500) }))).toEqual({});
  });

  it("requires a profile for an internal responsible", () => {
    expect(fieldErrors(form({ responsibleMode: "internal" })).responsibleProfileId).toBe(
      "Choisissez un responsable interne.",
    );
    expect(
      fieldErrors(form({ responsibleMode: "internal", responsibleProfileId: PROFILE })),
    ).toEqual({});
  });

  it("requires a name for an external responsible and checks the optional e-mail", () => {
    expect(fieldErrors(form({ responsibleMode: "external" })).responsibleName).toBe(
      "Le nom du responsable est obligatoire.",
    );
    expect(
      fieldErrors(
        form({ responsibleMode: "external", responsibleName: "Paul", responsibleEmail: "paul@" }),
      ).responsibleEmail,
    ).toBe("Adresse e-mail invalide.");
    expect(fieldErrors(form({ responsibleMode: "external", responsibleName: "Paul" }))).toEqual({});
  });

  it("refuses an invalid date, zone or priority", () => {
    expect(fieldErrors(form({ dueDate: "15/12/2026" })).dueDate).toBe("Date invalide.");
    expect(fieldErrors(form({ zoneKey: "Zone Libre" })).zoneKey).toBe("Zone invalide.");
    expect(fieldErrors({ ...form(), priority: "critique" }).priority).toBe("Priorité invalide.");
  });

  it("keeps only the fields of the chosen responsible mode", () => {
    const values = form({
      responsibleMode: "internal",
      responsibleProfileId: PROFILE,
      responsibleName: "reste d'une saisie externe",
      responsibleEmail: "paul@example.test",
    });
    const write = toReserveWrite(reserveFormSchema.parse(values));
    expect(write.responsibleKind).toBe("internal");
    expect(write.responsibleName).toBeNull();
    expect(write.responsibleEmail).toBeNull();
    const external = toReserveWrite(
      reserveFormSchema.parse(
        form({
          responsibleMode: "external",
          responsibleProfileId: PROFILE,
          responsibleName: " Paul ",
          responsibleCompany: "",
        }),
      ),
    );
    expect(external).toMatchObject({
      responsibleKind: "external",
      responsibleProfileId: null,
      responsibleName: "Paul",
      responsibleCompany: null,
    });
  });

  it("round-trips an existing reserve into the sheet", () => {
    const values = reserveToForm({
      action: "A",
      description: null,
      zoneKey: null,
      priority: "urgent",
      dueDate: "2026-12-01",
      responsibleKind: null,
      responsibleProfileId: null,
      responsibleName: null,
      responsibleCompany: null,
      responsibleEmail: null,
      photoIds: [],
    });
    expect(values.responsibleMode).toBe("none");
    expect(values.zoneKey).toBe("");
    expect(reserveFormSchema.safeParse(values).success).toBe(true);
  });
});
