import { deleteLocalDb, META_KEYS, readMeta, type RondeLocalDb } from "./db";

/** Days without any contact with the server after which the local copy is wiped. */
export const MAX_DAYS_WITHOUT_SERVER = 14;

/** True when the copy has not met the server for more than 14 days (or never, after 14 days). */
export function shouldWipeForInactivity(
  lastServerContactAt: string | undefined,
  firstOpenedAt: string | undefined,
  now: number,
): boolean {
  const reference = lastServerContactAt ?? firstOpenedAt;
  if (!reference) return false;
  return now - Date.parse(reference) > MAX_DAYS_WITHOUT_SERVER * 86_400_000;
}

/**
 * Erases the whole local database of a user: sign-out, « sessions révoquées », « compte
 * désactivé », or 14 days without contact. The outbox goes with it (the caller warned when it
 * was not empty).
 */
export async function wipeLocalData(db: RondeLocalDb): Promise<void> {
  const userId = db.userId;
  db.close();
  await deleteLocalDb(userId);
}

/** Reads what the inactivity rule needs. */
export async function inactivityInputs(db: RondeLocalDb) {
  return {
    lastServerContactAt: await readMeta<string>(db, META_KEYS.lastServerContactAt),
    firstOpenedAt: await readMeta<string>(db, "firstOpenedAt"),
  };
}
