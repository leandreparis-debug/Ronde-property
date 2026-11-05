// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildReportModel } from "@/lib/report/model";
import { DEFAULT_REPORT_OPTIONS } from "@/lib/report/options";

import { emptyData, photo, richData, reserve, tid } from "../fixtures";
import { imagesFor, readPdf, renderPdf } from "./helpers";

const NOW = new Date("2026-11-05T13:32:00.000Z");

describe("PDF rendering", () => {
  it("renders the rich visit: sections, R-04 overdue, figures, footer, fonts and metadata", async () => {
    const model = buildReportModel(richData(), DEFAULT_REPORT_OPTIONS, NOW);
    const buffer = await renderPdf(model, await imagesFor(model));
    const pdf = await readPdf(buffer);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(5);
    expect(pdf.pages[0]).toContain("Compte rendu de visite");
    expect(pdf.pages[0]).toContain("TEST-001");
    expect(pdf.pages[0]).toContain("BROUILLON");
    expect(pdf.pages[0]).not.toContain("Page 1 sur");
    expect(pdf.pages[1]).toContain(`Page 2 sur ${pdf.pageCount}`);
    expect(pdf.text).toContain("R-04");
    expect(pdf.text).toContain("En retard de 15 j");
    expect(pdf.text).toContain("Fig. 1");
    expect(pdf.text).toContain("Plan A");
    expect(pdf.text).toContain("Généré par RONDE le 5 novembre 2026 à 14:32 par Alice Fictive");
    expect(pdf.text).toContain("Refaire le marquage œ € >=");
    expect(pdf.text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const raw = buffer.toString("latin1");
    expect(raw).toMatch(/\/FontFile2/);
    expect(raw).toMatch(/BricolageGrotesque/);
    expect(raw).toMatch(/InstrumentSans/);
    expect(raw).toContain("/Lang (fr-FR)");
    expect(pdf.info).toMatchObject({
      Title: "Compte rendu de visite · TEST-001 · 5 novembre 2026",
      Author: "Alice Fictive",
      Creator: "RONDE",
    });
  }, 60_000);

  it("prints an empty visit on two pages with « Aucune réserve relevée »", async () => {
    const model = buildReportModel(emptyData(), DEFAULT_REPORT_OPTIONS, NOW);
    const pdf = await readPdf(await renderPdf(model, {}));
    expect(pdf.pageCount).toBe(2);
    expect(pdf.text).toContain("Aucune réserve relevée lors de cette visite.");
    expect(pdf.pages[1]).toContain("Page 2 sur 2");
  }, 60_000);

  it("splits a long note and a 60-reserve table over pages, header repeated", async () => {
    const data = emptyData();
    const sentence =
      "Le bardage présente des traces de corrosion sur la façade nord, à reprendre. ";
    data.zones[0]!.content = sentence.repeat(Math.ceil(5000 / sentence.length)).slice(0, 5000);
    data.reserves = Array.from({ length: 60 }, (_, index) =>
      reserve(index + 1, {
        action: `Reprendre l'élément ${index + 1} du bâtiment, avec une description assez longue pour tenir sur deux lignes`,
      }),
    );
    const model = buildReportModel(data, DEFAULT_REPORT_OPTIONS, NOW);
    const pdf = await readPdf(await renderPdf(model, {}));
    const reservePages = pdf.pages.filter((text) => text.includes("Responsable"));
    expect(reservePages.length).toBeGreaterThanOrEqual(2);
    for (const text of reservePages) expect(text).toContain("Échéance");
    for (let n = 1; n <= 60; n += 1) {
      const code = `R-${String(n).padStart(2, "0")}`;
      // A row is never split: its code and the end of its action sit on the same page.
      const page = pdf.pages.find((text) => text.includes(`${code} `));
      expect(page, code).toBeDefined();
      expect(page).toContain(`élément ${n} du bâtiment`);
    }
    const notePages = pdf.pages.filter((text) => text.includes("corrosion"));
    expect(notePages.length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("keeps generating when a photo is missing, with « Photo indisponible »", async () => {
    const data = emptyData();
    data.zones[0]!.content = "Une note.";
    data.photos = [
      photo(1, { zoneKey: "roof" }),
      photo(2, { zoneKey: "roof", caption: "Légende 😀 ≥ 2" }),
    ];
    const model = buildReportModel(data, DEFAULT_REPORT_OPTIONS, NOW);
    const images = await imagesFor(model, [`photo:${tid("6", 1)}`]);
    const pdf = await readPdf(await renderPdf(model, images));
    expect(pdf.text).toContain("Photo indisponible");
    expect(pdf.text).toContain("Légende >= 2");
  }, 60_000);

  it("is stable: two renders of the same model give the same text and page count", async () => {
    const model = buildReportModel(richData(), DEFAULT_REPORT_OPTIONS, NOW);
    const images = await imagesFor(model);
    const [first, second] = [
      await readPdf(await renderPdf(model, images)),
      await readPdf(await renderPdf(model, images)),
    ];
    expect(second.pageCount).toBe(first.pageCount);
    expect(second.text).toBe(first.text);
  }, 60_000);
});
