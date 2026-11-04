import type { PlanMimeType } from "@/server/plans/types";

/** Bytes read to detect the format: `%PDF-` may follow a few junk bytes (PDF 1.7, §7.5.2). */
export const PLAN_MAGIC_LENGTH = 1024;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function at(bytes: Uint8Array, signature: readonly number[], offset: number): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * The plan format of the first bytes of a file, or `null`. A PDF is recognised when `%PDF-`
 * appears within the first 1 024 bytes, as the specification allows; PNG and JPEG must start
 * at byte 0. The extension and `File.type` are never trusted.
 */
export function sniffPlanType(bytes: Uint8Array): PlanMimeType | null {
  if (at(bytes, PNG_SIGNATURE, 0)) return "image/png";
  if (at(bytes, [0xff, 0xd8, 0xff], 0)) return "image/jpeg";
  const limit = Math.min(bytes.length, PLAN_MAGIC_LENGTH) - PDF_SIGNATURE.length;
  for (let offset = 0; offset <= limit; offset += 1) {
    if (at(bytes, PDF_SIGNATURE, offset)) return "application/pdf";
  }
  return null;
}
