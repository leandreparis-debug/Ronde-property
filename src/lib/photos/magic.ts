/**
 * Image format detection by magic bytes. The browser's `File.type` only reflects the
 * extension, so the first bytes decide.
 */

export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

/** Number of bytes needed to decide. */
export const MAGIC_BYTES_LENGTH = 12;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return prefix.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** The supported image type of the bytes, or `null` for anything else. */
export function sniffImageType(bytes: Uint8Array): SupportedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** True for an ISO base media file whose brand is HEIC/HEIF (refused with a clear message). */
export function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== "ftyp") return false;
  const brand = ascii(bytes, 8, 12);
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
}
