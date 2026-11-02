import { createHash } from "node:crypto";

import Papa from "papaparse";

import { ValidationError } from "@/server/errors";

import { mapHeaders, normalizeRow, type RawRow } from "./format";
import type { DetectedEncoding, ParseResult, RowError, SiteField } from "./types";

// Vercel caps request bodies at 4.5 MB: nothing larger than 4 MB goes through a server action.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_DATA_LINES = 5000;
const ACCEPTED_EXTENSIONS = [".csv", ".txt"];

/** Detects the encoding: UTF-8 with BOM, valid UTF-8, otherwise Windows-1252. */
export function decodeBuffer(buffer: Uint8Array): { text: string; encoding: DetectedEncoding } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(buffer.subarray(3)), encoding: "utf-8-bom" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buffer), encoding: "windows-1252" };
  }
}

/** Rejects binary content disguised as text (NUL bytes or too many control characters). */
function assertTextual(text: string): void {
  if (text.includes("\u0000")) throw new ValidationError("Le fichier n'est pas un CSV texte.");
  const sample = text.slice(0, 4000);
  let control = 0;
  for (const char of sample) {
    const code = char.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) control += 1;
  }
  if (sample.length > 0 && control / sample.length > 0.01) {
    throw new ValidationError("Le fichier n'est pas un CSV texte.");
  }
}

/** Checks the name, size and extension before reading. */
export function assertAcceptableFile(fileName: string, size: number): void {
  const lower = fileName.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new ValidationError("Seuls les fichiers .csv ou .txt sont acceptés.");
  }
  if (size === 0) throw new ValidationError("Le fichier est vide.");
  if (size > MAX_FILE_BYTES) throw new ValidationError("Le fichier dépasse 4 Mo.");
}

/**
 * Parses a VIGIE CSV export: detects encoding and delimiter, maps the headers, normalises
 * and validates every line. Global problems (empty file, no header, missing required
 * columns, too many lines) throw a `ValidationError`; line problems go to `errors`.
 */
export function parseSitesCsv(buffer: Uint8Array, fileName: string): ParseResult {
  assertAcceptableFile(fileName, buffer.byteLength);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const { text, encoding } = decodeBuffer(buffer);
  assertTextual(text);
  if (text.trim() === "") throw new ValidationError("Le fichier est vide.");

  const parsed = Papa.parse<string[]>(text, {
    delimiter: "",
    delimitersToGuess: [";", ",", "\t", "|"],
    skipEmptyLines: "greedy",
    header: false,
  });
  const lines = parsed.data;
  const headerLine = lines[0];
  if (!headerLine || headerLine.every((cell) => cell.trim() === "")) {
    throw new ValidationError("Le fichier n'a pas de ligne d'en-tête.");
  }
  const headers = headerLine.map((cell) => cell.trim());
  const mapping = mapHeaders(headers);
  if (mapping.missingRequired.length > 0) {
    throw new ValidationError(
      `Colonnes obligatoires absentes : ${mapping.missingRequired
        .map((field) => (field === "warehouse_code" ? "Code entrepôt" : "Nom"))
        .join(", ")}.`,
    );
  }
  const dataLines = lines.slice(1);
  if (dataLines.length === 0)
    throw new ValidationError("Le fichier ne contient aucune ligne de données.");
  if (dataLines.length > MAX_DATA_LINES) {
    throw new ValidationError(`Le fichier dépasse ${MAX_DATA_LINES} lignes de données.`);
  }

  const rows: ParseResult["rows"] = [];
  const errors: RowError[] = [];
  dataLines.forEach((cells, offset) => {
    const line = offset + 2;
    const raw: RawRow = {};
    for (const { field, index } of mapping.recognized) raw[field] = cells[index] ?? null;
    const result = normalizeRow(line, raw);
    if ("row" in result) rows.push(result.row);
    else
      errors.push({
        line,
        code: raw.warehouse_code?.trim().toUpperCase() || null,
        message: result.errors.join(" "),
      });
  });

  return {
    fileName,
    sha256,
    encoding,
    delimiter: parsed.meta.delimiter,
    totalLines: dataLines.length,
    rows,
    errors,
    recognizedColumns: mapping.recognized.map(({ header, field }) => ({ header, field })),
    ignoredColumns: mapping.ignored,
    presentFields: mapping.recognized.map(({ field }) => field as SiteField),
  };
}
