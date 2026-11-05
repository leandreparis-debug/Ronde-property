/**
 * Critère 4 (cahier des charges, § 14) :
 * « Il génère un rapport conservé dans RONDE. » Le Word du cahier des charges est remplacé
 * par un PDF, sur décision de Léandre (docs/decisions.md).
 */
import { expect, test } from "@playwright/test";

import { generateReport, pdfText, sha256 } from "./helpers";

const V1 = "/visites/20000000-0000-4000-8000-000000000001";

test("C4 · rapport PDF généré, conservé dans l'historique et retéléchargé à l'identique", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const generated = await generateReport(page, V1);
  const pages = await pdfText(generated);
  const text = pages.join("\n");
  for (const expected of [
    "TEST-001",
    "Entrepôt fictif Lyon Sud",
    "Réserves",
    "R-04",
    "Notes par zone",
    "Fig. 1",
    "Plan A",
  ]) {
    expect(text, expected).toContain(expected);
  }

  // The report is kept: it is in the history and downloads again, byte for byte.
  const item = page.getByTestId("report-history-item").first();
  await expect(item).toContainText("Alice Fictive");
  const again = page.waitForEvent("download");
  await item.getByTestId("report-download").click();
  const stored = await again;
  expect(stored.suggestedFilename()).toBe(generated.suggestedFilename());
  expect(await sha256(stored)).toBe(await sha256(generated));
});
