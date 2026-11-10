import { describe, expect, it } from "vitest";

import {
  buildReportModel,
  pdfText,
  planLetter,
  reportDate,
  reportDateTime,
  reportFileName,
} from "@/lib/report/model";
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from "@/lib/report/options";

import { emptyData, richData, tid } from "./fixtures";

const NOW = new Date("2026-11-05T13:32:00.000Z");

function build(options: Partial<ReportOptions> = {}, data = richData()) {
  return buildReportModel(data, { ...DEFAULT_REPORT_OPTIONS, ...options }, NOW);
}

describe("buildReportModel · empty visit", () => {
  it("prints the cover, the summary and « Aucune réserve », no other section", () => {
    const model = buildReportModel(emptyData(), DEFAULT_REPORT_OPTIONS, NOW);
    expect(model.summary).not.toBeNull();
    expect(model.reserves).toEqual({ rows: [], includeDone: false, hiddenDone: 0 });
    expect(model.zones).toEqual([]);
    expect(model.plans).toEqual([]);
    expect(model.annex).toBeNull();
    expect(model.figures).toEqual([]);
    expect(model.cover.photo).toBeNull();
    expect(model.cover.counters).toEqual({ open: 0, overdue: 0, done: 0 });
    expect(model.isDraft).toBe(true);
  });
});

describe("buildReportModel · options", () => {
  it("leaves out the sections that are not chosen; the cover is always there", () => {
    const model = build({ sections: [] });
    expect(model.summary).toBeNull();
    expect(model.reserves).toBeNull();
    expect(model.zones).toEqual([]);
    expect(model.plans).toEqual([]);
    expect(model.annex).toBeNull();
    expect(model.cover.title).toBe("Compte rendu de visite");
  });

  it("hides done reserves by default (table and plan), shows them dimmed on demand", () => {
    const hidden = build();
    expect(hidden.reserves?.rows.map((r) => r.code)).not.toContain("R-03");
    expect(hidden.reserves?.hiddenDone).toBe(1);
    expect(hidden.plans[0]?.markers.map((m) => m.label)).not.toContain("R-03");
    const shown = build({ includeDoneReserves: true });
    const done = shown.reserves?.rows.find((r) => r.code === "R-03");
    expect(done?.isDone).toBe(true);
    expect(done?.statusLabel).toMatch(/^Levée le /);
    expect(shown.plans[0]?.markers.map((m) => m.label)).toContain("R-03");
  });

  it("groups the photos by page as chosen", () => {
    const two = build({ photosPerPage: 2 });
    expect(two.zones.find((z) => z.key === "roof")?.photoPages.map((p) => p.length)).toEqual([2]);
    const six = build({ photosPerPage: 6 });
    expect(six.photosPerPage).toBe(6);
  });

  it("uses the chosen cover photo, else the cover photo of the visit", () => {
    expect(build().cover.photo?.url).toBe("https://images.test/photo-1.jpg");
    expect(build({ coverPhotoId: tid("6", 3) }).cover.photo?.url).toBe(
      "https://images.test/photo-3.jpg",
    );
  });
});

describe("buildReportModel · reserves", () => {
  it("sorts overdue first, then priority, then due date; counts every reserve", () => {
    const model = build({ includeDoneReserves: true });
    expect(model.reserves?.rows.map((r) => r.code)).toEqual([
      "R-04",
      "R-05",
      "R-01",
      "R-02",
      "R-03",
    ]);
    expect(model.cover.counters).toEqual({ open: 4, overdue: 1, done: 1 });
    const overdue = model.reserves?.rows[0];
    expect(overdue?.overdueLabel).toBe("En retard de 15 j");
    expect(overdue?.dueLabel).toBe("21/10/2026");
    expect(model.reserves?.rows.find((r) => r.code === "R-05")?.dueLabel).toBe("Aucune");
  });

  it("refers to the figure of the photo and to the plan", () => {
    const model = build();
    const r1 = model.reserves?.rows.find((r) => r.code === "R-01");
    expect(r1?.figureRef).toBe("Fig. 2");
    expect(r1?.planRef).toBe("Plan A, R-01");
    expect(r1?.responsible).toBe("Bruno Fictif");
    expect(model.reserves?.rows.find((r) => r.code === "R-02")?.responsible).toBe(
      "Marc Imaginaire · Maintenance Fictive SAS",
    );
    expect(model.reserves?.rows.find((r) => r.code === "R-05")?.responsible).toBe("À désigner");
  });

  it("lists urgent and overdue reserves as key points", () => {
    expect(build().summary?.keyPoints).toEqual([
      { code: "R-04", text: "Refaire le marquage œ € >=", tag: "En retard de 15 j" },
      { code: "R-05", text: "Action 5", tag: "Urgente" },
    ]);
  });
});

describe("buildReportModel · notes, figures and annex", () => {
  it("parses the notes, skips empty zones and numbers figures in print order", () => {
    const model = build();
    expect(model.zones.map((z) => z.title)).toEqual(["Toiture", "Quais", "Hors zone"]);
    const roof = model.zones[0]!;
    expect(roof.blocks).toEqual([
      { type: "paragraph", text: "Étanchéité correcte." },
      { type: "bullets", items: ["Lanterneau 4 fissuré", "Évacuation >= 2 m bouchée"] },
    ]);
    expect(roof.reserves.map((r) => r.code)).toEqual(["R-01"]);
    expect(model.figures.map((f) => `${f.label}:${f.photoId.slice(-2)}`)).toEqual([
      "Fig. 1:01",
      "Fig. 2:02",
      "Fig. 3:03",
      "Fig. 4:04",
      "Fig. 5:05",
    ]);
    // Photo 4 has no zone but illustrates R-02 (no zone): « Hors zone »; photo 5 is linked to
    // nothing: annex.
    expect(model.zones[2]?.photoPages.flat().map((f) => f.number)).toEqual([4]);
    expect(model.annex?.photoPages.flat().map((f) => f.number)).toEqual([5]);
  });

  it("draws markers and their legend with the figure or reserve references", () => {
    const plan = build().plans[0]!;
    expect(plan.title).toBe("Plan A");
    expect(plan.markers.map((m) => [m.kind, m.label])).toEqual([
      ["photo", "1"],
      ["reserve", "R-01"],
    ]);
    expect(plan.legend[0]).toEqual({ label: "1", kind: "photo", text: "Quai 3", ref: "Fig. 3" });
    expect(plan.legend[1]).toMatchObject({ label: "R-01", kind: "reserve", ref: "Fig. 2" });
  });
});

describe("buildReportModel · identity and privacy", () => {
  it("names the file, sets the metadata and the footer", () => {
    const model = build();
    expect(model.meta.fileName).toBe("RONDE_TEST-001_2026-11-05_1.pdf");
    expect(model.meta).toMatchObject({
      creator: "RONDE",
      language: "fr-FR",
      author: "Alice Fictive",
    });
    expect(model.footer.left).toBe("TEST-001 · Visite du 5 novembre 2026");
    expect(model.footer.generated).toBe(
      "Généré par RONDE le 5 novembre 2026 à 14:32 par Alice Fictive",
    );
  });

  it("is a draft only while the visit is in progress", () => {
    const data = richData();
    data.report.isDraft = false;
    data.visit.status = "completed";
    data.visit.completedAt = "2026-11-05T16:00:00.000Z";
    const model = buildReportModel(data, DEFAULT_REPORT_OPTIONS, NOW);
    expect(model.isDraft).toBe(false);
    expect(model.summary?.info.find((i) => i.label === "Statut")?.value).toBe(
      "Terminée le 5 novembre 2026",
    );
  });

  it("never contains an e-mail address, even when one slips into a free text", () => {
    const data = richData();
    const model = buildReportModel(
      data,
      { ...DEFAULT_REPORT_OPTIONS, includeDoneReserves: true },
      NOW,
    );
    expect(JSON.stringify(model)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it("is deterministic for the same data, options and date", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

describe("helpers", () => {
  it("formats dates in French, Europe/Paris", () => {
    expect(reportDate("2026-11-05")).toBe("5 novembre 2026");
    expect(reportDate(new Date("2026-12-31T23:30:00Z"))).toBe("1 janvier 2027");
    expect(reportDateTime(new Date("2026-07-01T12:05:00Z"))).toBe("1 juillet 2026 à 14:05");
  });

  it("builds file names like the database and plan letters", () => {
    expect(reportFileName("TEST-001", "2026-11-05", 3)).toBe("RONDE_TEST-001_2026-11-05_3.pdf");
    expect(reportFileName("LY 01/B", "2026-11-05", 1)).toBe("RONDE_LY-01-B_2026-11-05_1.pdf");
    expect([0, 1, 25, 26, 27].map(planLetter)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });

  it("keeps accents, œ and € and replaces what the fonts cannot draw", () => {
    expect(pdfText("Cœur à 5 € ≥ 2 m², ✓ 👍🏽 fin")).toBe("Cœur à 5 € >= 2 m2, OK fin");
    expect(pdfText(null)).toBe("");
  });
});

describe("buildReportModel · plans in the order of the site (step 12 b)", () => {
  it("prints the exterior view with the outlines, then each building from the bottom up", () => {
    const planId = tid("7", 9);
    const image = (n: number) => ({
      key: `page:${planId}:${n}`,
      url: `https://images.test/p${n}.png`,
      width: 3500,
      height: 2475,
    });
    const marker = (n: number, page: number, kind: "photo" | "note" = "photo") => ({
      id: tid("8", 90 + n),
      planId,
      page,
      x: 0.5,
      y: 0.5,
      number: n,
      kind,
      label: kind === "note" ? "Odeur de gaz" : null,
      photoId: null,
      reserveId: null,
    });
    const view = (
      id: string,
      kind: "exterior" | "level",
      buildingId: string | null,
      label: string,
      sortOrder: number,
      pageNumber: number,
    ) => ({
      id,
      kind,
      buildingId,
      label,
      sortOrder,
      planId,
      pageNumber,
      replacedBy: null,
      isArchived: false,
    });
    const data = emptyData({
      plans: [
        {
          id: planId,
          name: "Plan général",
          isArchived: false,
          pages: [1, 2, 3, 4].map((n) => ({ pageNumber: n, image: image(n) })),
          markers: [marker(1, 4), marker(2, 2, "note"), marker(3, 3)],
        },
      ],
      buildings: [
        {
          id: "B",
          name: "Bâtiment B",
          sortOrder: 1,
          outline: [
            { x: 0.5, y: 0.1 },
            { x: 0.9, y: 0.1 },
            { x: 0.9, y: 0.5 },
          ],
          isArchived: false,
        },
        { id: "A", name: "Bâtiment A", sortOrder: 0, outline: null, isArchived: false },
      ],
      views: [
        view("ext", "exterior", null, "Vue extérieure", 0, 1),
        view("b1", "level", "B", "R+1", 1, 2),
        view("b0", "level", "B", "RDC", 0, 4),
        view("a0", "level", "A", "RDC", 0, 3),
      ],
    });
    const model = buildReportModel(data, DEFAULT_REPORT_OPTIONS, NOW);
    expect(model.plans.map((p) => p.title)).toEqual([
      "Vue extérieure",
      "Bâtiment A · RDC",
      "Bâtiment B · RDC",
      "Bâtiment B · R+1",
    ]);
    expect(model.plans[0]?.outlines).toEqual([
      { name: "Bâtiment B", points: data.buildings[0]!.outline },
    ]);
    expect(model.plans[0]?.markers).toEqual([]);
    expect(model.plans.every((p) => p.isView)).toBe(true);
    const notes = model.plans[3]!;
    expect(notes.markers[0]?.kind).toBe("note");
    expect(notes.legend).toEqual([{ label: "2", kind: "note", text: "Odeur de gaz", ref: null }]);
  });

  it("keeps « Plan A » for a page assigned to no view", () => {
    const model = build();
    expect(model.plans[0]).toMatchObject({ title: "Plan A", isView: false, outlines: [] });
  });
});
