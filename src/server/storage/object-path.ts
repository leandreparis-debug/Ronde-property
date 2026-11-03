import { ValidationError } from "@/server/errors";

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_PATH_LENGTH = 512;

/**
 * True for an object path safe for every provider: relative, made of `/`-separated segments
 * of letters, digits, `.`, `_` and `-`, no empty segment, no `.` or `..` segment, no control
 * or null character, no backslash. Also refuses the `.meta.json` suffix reserved by the local
 * provider.
 */
export function isSafeObjectPath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    return false;
  }
  if (path.endsWith(".meta.json")) return false;
  const segments = path.split("/");
  return segments.every((segment) => SEGMENT.test(segment) && segment !== "." && segment !== "..");
}

/**
 * Throws a {@link ValidationError} when the path is unsafe.
 *
 * @throws {ValidationError}
 */
export function assertSafeObjectPath(path: string): void {
  if (!isSafeObjectPath(path)) {
    throw new ValidationError("Chemin de fichier invalide.");
  }
}
