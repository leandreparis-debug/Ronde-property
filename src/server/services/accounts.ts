import "server-only";

import { z } from "zod";

import { recordAuditInTrx } from "@/server/auth/audit";
import { normalizeEmail } from "@/server/auth/passwords";
import { getAccountAdminService } from "@/server/auth/provider";
import { requireRoleForAction } from "@/server/auth/session";
import type { CurrentUser } from "@/server/auth/types";
import { withSystem } from "@/server/db/context";
import { USER_ROLES, type UserRole } from "@/server/domain/enums";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { assertAccountChangeAllowed, assertFullName } from "./account-rules";

/** Account as listed on /admin/comptes. */
export interface Account {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  /** GDPR anonymisation date (name and e-mail replaced, irreversible). */
  anonymizedAt: Date | null;
}

export const createAccountSchema = z.object({
  email: z.email("Adresse e-mail invalide.").transform(normalizeEmail),
  fullName: z.string().trim().min(1, "Le nom est obligatoire.").max(200, "200 caractères maximum."),
  role: z.enum(USER_ROLES, { message: "Rôle invalide." }),
});
export type CreateAccountForm = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  fullName: z.string().trim().min(1, "Le nom est obligatoire.").max(200, "200 caractères maximum."),
  role: z.enum(USER_ROLES, { message: "Rôle invalide." }),
});
export type UpdateAccountForm = z.infer<typeof updateAccountSchema>;

function toAccount(row: {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at: Date;
  anonymized_at: Date | null;
}): Account {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    anonymizedAt: row.anonymized_at,
  };
}

const ACCOUNT_COLUMNS = [
  "id",
  "email",
  "full_name",
  "role",
  "is_active",
  "must_change_password",
  "created_at",
  "anonymized_at",
] as const;

/*
 * Every function checks the admin role itself (requireRoleForAction) so that no caller can
 * skip it. Reads go through withSystem because users only see four profile columns.
 */

/** Lists every account, active first, then by name. Admin only. */
export async function listAccounts(): Promise<Account[]> {
  const admin = await requireRoleForAction(["admin"]);
  const rows = await withSystem(`accounts.list:${admin.id}`, (trx) =>
    trx
      .selectFrom("profiles")
      .select(ACCOUNT_COLUMNS)
      .orderBy("is_active", "desc")
      .orderBy("full_name", "asc")
      .execute(),
  );
  return rows.map(toAccount);
}

/** One account by id, or `NotFoundError`. No role check: callers check it first. */
export async function findAccount(id: string): Promise<Account> {
  const row = await withSystem("accounts.find", (trx) =>
    trx.selectFrom("profiles").select(ACCOUNT_COLUMNS).where("id", "=", id).executeTakeFirst(),
  );
  if (!row) throw new NotFoundError("Compte introuvable.");
  return toAccount(row);
}

async function countActiveAdmins(): Promise<number> {
  const row = await withSystem("accounts.count_admins", (trx) =>
    trx
      .selectFrom("profiles")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("role", "=", "admin")
      .where("is_active", "=", true)
      .executeTakeFirstOrThrow(),
  );
  return Number(row.count);
}

async function assertEmailAvailable(email: string): Promise<void> {
  const existing = await withSystem("accounts.email_check", (trx) =>
    trx.selectFrom("profiles").select("id").where("email", "=", email).executeTakeFirst(),
  );
  if (existing) throw new ConflictError("Cette adresse e-mail est déjà utilisée.");
}

/**
 * Creates an account through the auth provider and returns the temporary password,
 * which is shown once and never stored in clear. Audit: `account.created`.
 */
export async function createAccount(
  input: CreateAccountForm,
): Promise<{ account: Account; temporaryPassword: string }> {
  const admin = await requireRoleForAction(["admin"]);
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
  await assertEmailAvailable(parsed.data.email);

  const { userId, temporaryPassword } = await getAccountAdminService().createAccount(parsed.data);
  await withSystem("audit.account.created", (trx) =>
    recordAuditInTrx(
      trx,
      "account.created",
      "profile",
      userId,
      { role: parsed.data.role },
      admin.id,
    ),
  );
  return { account: await findAccount(userId), temporaryPassword };
}

/** Updates name and role. The profile triggers audit role changes. */
export async function updateAccount(id: string, input: UpdateAccountForm): Promise<Account> {
  const admin = await requireRoleForAction(["admin"]);
  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
  const target = await findAccount(id);
  assertAccountChangeAllowed(
    admin.id,
    target,
    { role: parsed.data.role },
    await countActiveAdmins(),
  );

  await withSystem(`accounts.update:${admin.id}`, (trx) =>
    trx
      .updateTable("profiles")
      .set({ full_name: assertFullName(parsed.data.fullName), role: parsed.data.role })
      .where("id", "=", id)
      .execute(),
  );
  return findAccount(id);
}

/** Activates or deactivates an account. A deactivated user is signed out at their next request. */
export async function setActive(id: string, isActive: boolean): Promise<Account> {
  const admin = await requireRoleForAction(["admin"]);
  const target = await findAccount(id);
  assertAccountChangeAllowed(admin.id, target, { isActive }, await countActiveAdmins());

  await withSystem(`accounts.set_active:${admin.id}`, (trx) =>
    trx.updateTable("profiles").set({ is_active: isActive }).where("id", "=", id).execute(),
  );
  return findAccount(id);
}

/**
 * Signs the account out of every device (« Déconnecter toutes les sessions »): sessions opened
 * before now are refused at their next request. Audit `profile.sessions_revoked` (trigger).
 */
export async function revokeSessions(id: string): Promise<Account> {
  await requireRoleForAction(["admin"]);
  const target = await findAccount(id);
  await getAccountAdminService().revokeSessions(target.id);
  return findAccount(target.id);
}

/**
 * Resets the password to a new temporary one, shown once, and signs the account out of every
 * device. Audit: `account.password_reset`, `profile.sessions_revoked`.
 */
export async function resetPassword(
  id: string,
): Promise<{ account: Account; temporaryPassword: string }> {
  const admin = await requireRoleForAction(["admin"]);
  const target = await findAccount(id);
  const service = getAccountAdminService();
  const { temporaryPassword } = await service.resetPassword(target.id);
  await service.revokeSessions(target.id);
  await withSystem("audit.account.password_reset", (trx) =>
    recordAuditInTrx(trx, "account.password_reset", "profile", target.id, {}, admin.id),
  );
  return { account: await findAccount(target.id), temporaryPassword };
}

/** Current admin, for callers that need the actor without re-checking. */
export type { CurrentUser };
