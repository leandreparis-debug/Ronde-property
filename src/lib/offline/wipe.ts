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

/**
 * Erases the local database of a user, waiting at most `timeoutMs` (another connection, such
 * as a second tab, can hold the deletion). Returns whether the deletion finished in time; the
 * request stays queued otherwise, and the sign-in page finishes it (`markPendingWipe`).
 */
export async function wipeUserData(
  userId: string,
  db: RondeLocalDb | null,
  timeoutMs = 3_000,
): Promise<boolean> {
  db?.close();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([
      deleteLocalDb(userId).then(
        () => true,
        () => false,
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads what the inactivity rule needs. */
export async function inactivityInputs(db: RondeLocalDb) {
  return {
    lastServerContactAt: await readMeta<string>(db, META_KEYS.lastServerContactAt),
    firstOpenedAt: await readMeta<string>(db, "firstOpenedAt"),
  };
}
