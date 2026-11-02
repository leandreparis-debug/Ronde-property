import type { Profile, ProfileSummary, UserRole } from "@/server/domain";

/**
 * Profiles. Regular users read the public summary of every active profile and rename
 * themselves; account creation, role and activation changes are admin operations that
 * run with the service role (step 3).
 */
export interface ProfileRepository {
  /** Current user's own profile, or null when signed out or without profile. */
  me(): Promise<Profile | null>;
  listSummaries(options?: { activeOnly?: boolean }): Promise<ProfileSummary[]>;
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
