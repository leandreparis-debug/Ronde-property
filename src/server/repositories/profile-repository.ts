import "server-only";

import { type UserRef, withUser } from "@/server/db/context";
import type { Profile, ProfileSummary, UserRole } from "@/server/domain";

/** Profile that can be chosen as writer or internal participant. */
export interface AssignableProfile {
  id: string;
  fullName: string;
}

/** Active rt and admin profiles, ordered by name, read as the user (RLS). */
export async function listAssignableProfiles(user: UserRef): Promise<AssignableProfile[]> {
  const rows = await withUser(user, (trx) =>
    trx
      .selectFrom("profiles")
      .select(["id", "full_name"])
      .where("is_active", "=", true)
      .where("role", "in", ["rt", "admin"])
      .orderBy("full_name")
      .execute(),
  );
  return rows.map((row) => ({ id: row.id, fullName: row.full_name }));
}

/**
 * Profiles. Regular users read the public summary of every active profile and rename
 * themselves; account creation, role and activation changes are admin operations that
 * run with the service role (step 3).
 */
export interface ProfileRepository {
  /** Current user's own profile, or null when signed out or without profile. */
  me(): Promise<Profile | null>;
  listSummaries(options?: { activeOnly?: boolean }): Promise<ProfileSummary[]>;
  /** Active rt and admin profiles, for the writer and internal participants. */
  listAssignable(): Promise<AssignableProfile[]>;
  updateOwnName(fullName: string): Promise<Profile>;

  /** Admin operations (service role). */
  createAccount(input: {
    email: string;
    fullName: string;
    role: UserRole;
    temporaryPassword: string;
  }): Promise<Profile>;
  setRole(id: string, role: UserRole): Promise<Profile>;
  setActive(id: string, isActive: boolean): Promise<Profile>;
}
