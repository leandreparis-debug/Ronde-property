import { formatDateTime } from "@/lib/format";

/** One feedback as listed on /admin/avis and exported. */
export interface FeedbackRow {
  id: string;
  createdAt: Date;
  authorName: string;
  authorRole: string;
  rating: number;
  works: string | null;
  blocks: string | null;
  pagePath: string;
  viewport: string | null;
  appVersion: string;
}

const HEADERS = [
  "Date",
  "Auteur",
  "Rôle",
  "Note",
  "Ce qui marche",
  "Ce qui bloque",
  "Page",
  "Écran",
  "Version",
];

/**
 * One CSV cell: quoted, inner quotes doubled; a value starting with = + - @ (or a tab / carriage
 * return) is prefixed with an apostrophe so that a spreadsheet never runs it as a formula.
 */
export function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * CSV for Excel in French: UTF-8 with BOM, « ; » separator, CRLF line ends, dates in
 * Europe/Paris.
 */
export function feedbackCsv(rows: FeedbackRow[]): string {
  const lines = [HEADERS.map(csvCell).join(";")];
  for (const row of rows) {
    lines.push(
      [
        formatDateTime(row.createdAt),
        row.authorName,
        row.authorRole,
        row.rating,
        row.works,
        row.blocks,
        row.pagePath,
        row.viewport,
        row.appVersion,
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
