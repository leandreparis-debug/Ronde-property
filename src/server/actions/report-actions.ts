"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { reportOptionsSchema } from "@/lib/report/options";
import type { ReportData } from "@/lib/report/types";
import { userMessage } from "@/server/errors";
import type {
  ConfirmReportResult,
  ReportUploadTarget,
  ReportView,
  StartedReport,
} from "@/server/reports/service";
import {
  confirmReport,
  getReportData,
  listVisitReports,
  renewReportImageUrls,
  reportUploadTarget,
  startReport,
} from "@/server/services/reports";

type Fail = { ok: false; error: string };

function fail(error: unknown): Fail {
  return { ok: false, error: userMessage(error) };
}

export type StartReportResult = ({ ok: true } & StartedReport) | Fail;

/** Reserves a report of the visit and returns its frozen data (generation starts). */
export async function startReportAction(input: unknown): Promise<StartReportResult> {
  const parsed = z.object({ visitId: z.uuid(), options: reportOptionsSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Options du rapport invalides." };
  try {
    return { ok: true, ...(await startReport(parsed.data.visitId, parsed.data.options)) };
  } catch (error) {
    return fail(error);
  }
}

export type ReportDataResult = { ok: true; data: ReportData } | Fail;

/** Frozen data of the visit without reserving a report (preview of the counts). */
export async function reportDataAction(input: unknown): Promise<ReportDataResult> {
  const parsed = z.object({ visitId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return { ok: true, data: await getReportData(parsed.data.visitId) };
  } catch (error) {
    return fail(error);
  }
}

export type ReportUploadResult = { ok: true; target: ReportUploadTarget } | Fail;

/** Signed upload URL of the caller's pending report (the PDF never goes through the server). */
export async function reportUploadTargetAction(input: unknown): Promise<ReportUploadResult> {
  const parsed = z
    .object({ reportId: z.uuid(), sizeBytes: z.number().int().positive() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return {
      ok: true,
      target: await reportUploadTarget(parsed.data.reportId, parsed.data.sizeBytes),
    };
  } catch (error) {
    return fail(error);
  }
}

/** Confirms the uploaded PDF: the report joins the history of the visit. */
export async function confirmReportAction(input: unknown): Promise<ConfirmReportResult> {
  const parsed = z
    .object({
      reportId: z.uuid(),
      visitId: z.uuid(),
      sizeBytes: z.number().int().positive(),
      pageCount: z.number().int().min(1).max(5000),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide.", retryable: false };
  try {
    const result = await confirmReport(
      parsed.data.reportId,
      parsed.data.sizeBytes,
      parsed.data.pageCount,
    );
    if (result.ok) {
      revalidatePath(`/visites/${parsed.data.visitId}`);
      revalidatePath("/");
      revalidatePath("/sites/[code]", "page");
    }
    return result;
  } catch (error) {
    return { ...fail(error), retryable: true };
  }
}

export type ReportListResult = { ok: true; reports: ReportView[] } | Fail;

/** History of the reports of a visit. */
export async function listReportsAction(input: unknown): Promise<ReportListResult> {
  const parsed = z.object({ visitId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return { ok: true, reports: await listVisitReports(parsed.data.visitId) };
  } catch (error) {
    return fail(error);
  }
}

export type RenewImagesResult = { ok: true; urls: Record<string, string> } | Fail;

/** Fresh signed URLs of report images whose URL expired during the generation. */
export async function renewReportImagesAction(input: unknown): Promise<RenewImagesResult> {
  const parsed = z
    .object({
      visitId: z.uuid(),
      keys: z
        .array(z.string().regex(/^(photo:[0-9a-f-]{36}|page:[0-9a-f-]{36}:\d{1,4})$/))
        .max(600),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return { ok: true, urls: await renewReportImageUrls(parsed.data.visitId, parsed.data.keys) };
  } catch (error) {
    return fail(error);
  }
}
