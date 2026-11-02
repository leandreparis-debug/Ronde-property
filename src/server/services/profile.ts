import "server-only";

import { getAuthService } from "@/server/auth/provider";
import { requireUserForAction } from "@/server/auth/session";
import { withUser } from "@/server/db/context";
import { ValidationError } from "@/server/errors";

import { assertFullName } from "./account-rules";

/** Renames the current user (RLS: own full_name only). */
export async function updateOwnName(fullName: string): Promise<void> {
  const user = await requireUserForAction();
  const trimmed = assertFullName(fullName);
  const result = await withUser(user, (trx) =>
    trx
      .updateTable("profiles")
      .set({ full_name: trimmed })
      .where("id", "=", user.id)
      .executeTakeFirst(),
  );
  if (Number(result.numUpdatedRows) !== 1)
    throw new ValidationError("Le nom n'a pas pu être enregistré.");
}

/** Changes the current user's password through the auth provider. */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await requireUserForAction();
  const auth = await getAuthService();
  await auth.changePassword(currentPassword, newPassword);
}
