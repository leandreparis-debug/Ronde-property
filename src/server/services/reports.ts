import "server-only";

import type { ReportOptions } from "@/lib/report/options";
import type { ReportData } from "@/lib/report/types";
import { requireUserForAction } from "@/server/auth/session";
import {
  type ConfirmReportResult,
  createReportService,
  type ReportService,
  type ReportUploadTarget,
  type ReportView,
  type StartedReport,
} from "@/server/reports/service";
import { getStorageService } from "@/server/storage";

/*
 * Every active user who can read the visit may generate its report: rt, admin and direction
 * (RLS `reports_insert`). A deactivated account has no session (`requireUserForAction`).
 */
async function forUser(): Promise<ReportService> {
  const user = await requireUserForAction();
  return createReportService(user, getStorageService());
}

/**
 * The frozen data of a report (one `withUser` transaction, signed image URLs, no e-mail):
 * visit and site, participants, zones, ready photos with their links, plans used by the visit
 * with their markers, reserves (responsible: name and company only).
 */
export async function getReportData(visitId: string): Promise<ReportData> {
  return (await forUser()).getData(visitId);
}

/** Reserves the report (pending row: number, file name, draft flag) and freezes its data. */
export async function startReport(visitId: string, options: ReportOptions): Promise<StartedReport> {
  return (await forUser()).start(visitId, options);
}

/** Signed PUT of the PDF of the caller's pending report. */
export async function reportUploadTarget(
  reportId: string,
  sizeBytes: number,
): Promise<ReportUploadTarget> {
  return (await forUser()).uploadTarget(reportId, sizeBytes);
}

/** Checks the uploaded PDF and marks the report ready (audit `report.generated`). */
export async function confirmReport(
  reportId: string,
  sizeBytes: number,
  pageCount: number,
): Promise<ConfirmReportResult> {
  return (await forUser()).confirm(reportId, sizeBytes, pageCount);
}

/** Ready reports of a visit, most recent first. */
export async function listVisitReports(visitId: string): Promise<ReportView[]> {
  return (await forUser()).list(visitId);
}

/** Options of the last report of the visit (or the defaults). */
export async function lastReportOptions(visitId: string): Promise<ReportOptions> {
  return (await forUser()).lastOptions(visitId);
}

/** Signed download URL (10 minutes) of a ready report. */
export async function reportDownloadUrl(
  reportId: string,
): Promise<{ url: string; visitId: string }> {
  return (await forUser()).downloadUrl(reportId);
}

/** Fresh signed URLs of report images (expired during a long generation). */
export async function renewReportImageUrls(
  visitId: string,
  keys: string[],
): Promise<Record<string, string>> {
  return (await forUser()).renewImageUrls(visitId, keys);
}
