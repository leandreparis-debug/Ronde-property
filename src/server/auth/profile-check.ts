import "server-only";

import { withSystem } from "@/server/db/context";

/**
 * Whether the authenticated user has an active profile. Shared by both providers so that an
 * inactive or profile-less account is refused at sign-in with the same generic message.
 */
export async function hasActiveProfile(userId: string): Promise<boolean> {
  const row = await withSystem("auth.profile_check", (trx) =>
    trx.selectFrom("profiles").select(["is_active"]).where("id", "=", userId).executeTakeFirst(),
  );
  return row?.is_active === true;
}
