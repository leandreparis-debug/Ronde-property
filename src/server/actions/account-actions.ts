"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userMessage } from "@/server/errors";
import { createAccount, resetPassword, setActive, updateAccount } from "@/server/services/accounts";
import { updateOwnName } from "@/server/services/profile";

import type { ActionState } from "./state";

/** State of the account actions that reveal a temporary password once. */
export interface AccountActionState extends ActionState {
  temporaryPassword?: string;
  accountId?: string;
  email?: string;
}

const ACCOUNTS_PATH = "/admin/comptes";

function failure(error: unknown): AccountActionState {
  return { ok: false, error: userMessage(error) };
}

/** Renames the current user. */
export async function updateOwnNameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateOwnName(String(formData.get("fullName") ?? ""));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/compte");
  revalidatePath("/", "layout");
  return { ok: true, tick: Date.now() };
}

/** Admin: creates an account and returns its temporary password (shown once). */
export async function createAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const { account, temporaryPassword } = await createAccount({
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      role: String(formData.get("role") ?? "") as never,
    });
    revalidatePath(ACCOUNTS_PATH);
    return {
      ok: true,
      tick: Date.now(),
      temporaryPassword,
      accountId: account.id,
      email: account.email,
    };
  } catch (error) {
    return failure(error);
  }
}

const idSchema = z.uuid();

/** Admin: updates name and role. */
export async function updateAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Compte introuvable." };
  try {
    await updateAccount(id.data, {
      fullName: String(formData.get("fullName") ?? ""),
      role: String(formData.get("role") ?? "") as never,
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(ACCOUNTS_PATH);
  return { ok: true, tick: Date.now() };
}

/** Admin: activates or deactivates an account. */
export async function setActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Compte introuvable." };
  try {
    await setActive(id.data, formData.get("isActive") === "true");
  } catch (error) {
    return failure(error);
  }
  revalidatePath(ACCOUNTS_PATH);
  return { ok: true, tick: Date.now() };
}

/** Admin: resets a password and returns the new temporary one (shown once). */
export async function resetPasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Compte introuvable." };
  try {
    const { account, temporaryPassword } = await resetPassword(id.data);
    revalidatePath(ACCOUNTS_PATH);
    return {
      ok: true,
      tick: Date.now(),
      temporaryPassword,
      accountId: account.id,
      email: account.email,
    };
  } catch (error) {
    return failure(error);
  }
}
