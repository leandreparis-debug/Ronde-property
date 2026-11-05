import { describe, expect, it } from "vitest";

import { formatFileSize, stepLabel } from "@/components/report/report-tab";

describe("report tab helpers", () => {
  it("labels each step of the generation", () => {
    expect(stepLabel({ kind: "preparing" })).toBe("Préparation des données…");
    expect(stepLabel({ kind: "images", done: 12, total: 40 })).toBe(
      "Chargement des photos 12 sur 40",
    );
    expect(stepLabel({ kind: "images", done: 0, total: 0 })).toBe("Aucune image à charger");
    expect(stepLabel({ kind: "layout" })).toBe("Mise en page…");
    expect(stepLabel({ kind: "saving", loaded: 1, total: 2 })).toBe("Enregistrement…");
  });

  it("formats file sizes in French", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(300)).toBe("1 Ko");
    expect(formatFileSize(850 * 1024)).toBe("850 Ko");
    expect(formatFileSize(2.45 * 1024 * 1024)).toBe("2,5 Mo");
  });
});
