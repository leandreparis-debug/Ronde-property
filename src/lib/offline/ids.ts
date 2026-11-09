/**
 * UUID v7 generated on the device (RFC 9562): 48 bits of Unix time in milliseconds, then
 * random bits. Time-ordered, so the identifiers created offline sort by creation, and unique
 * enough for the server to accept them as primary keys (operations and entities).
 */
export function uuidv7(now: number = Date.now(), random: Uint8Array = randomBytes(10)): string {
  const bytes = new Uint8Array(16);
  const time = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number((time >> BigInt(8 * (5 - index))) & 0xffn);
  }
  bytes.set(random.subarray(0, 10), 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True for any RFC 4122 / 9562 UUID string. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
