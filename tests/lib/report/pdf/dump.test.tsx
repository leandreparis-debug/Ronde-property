// @vitest-environment node
import { writeFileSync } from "node:fs";

import { it } from "vitest";

import { buildReportModel } from "@/lib/report/model";
import { DEFAULT_REPORT_OPTIONS } from "@/lib/report/options";

import { richData } from "../fixtures";
import { imagesFor, renderPdf } from "./helpers";

it.skipIf(!process.env.REPORT_DUMP)(
  "dumps the rich report",
  async () => {
    const model = buildReportModel(
      richData(),
      DEFAULT_REPORT_OPTIONS,
      new Date("2026-11-05T13:32:00Z"),
    );
    writeFileSync(process.env.REPORT_DUMP!, await renderPdf(model, await imagesFor(model)));
  },
  60_000,
);
