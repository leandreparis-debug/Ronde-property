"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthService } from "@/server/auth/provider";
import { safeNext } from "@/server/auth/session";
import { userMessage } from "@/server/errors";
import { changeOwnPassword } from "@/server/services/profile";

import type { ActionState } from "./state";

const GENERIC_SIGN_IN_ERROR = "Email ou mot de passe incorrect.";

const signInSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
  next: z.string().max(2048).optional(),
});

/** Signs the user in with email and password, then redirects to a validated `next`. */
export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: GENERIC_SIGN_IN_ERROR };

  let result: Awaited<ReturnType<Awaited<ReturnType<typeof getAuthService>>["signIn"]>>;
  try {
    const auth = await getAuthService();
    result = await auth.signIn(parsed.data.email, parsed.data.password);
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "rate_limited"
          ? "Trop de tentatives. Réessayez dans quelques minutes."
          : GENERIC_SIGN_IN_ERROR,
    };
  }
  redirect(safeNext(parsed.data.next));
}

/** Signs out and returns to the sign-in page. */
export async function signOutAction(): Promise<void> {
  try {
    const auth = await getAuthService();
    await auth.signOut();
  } finally {
    redirect("/connexion");
  }
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est obligatoire."),
    newPassword: z.string().min(1, "Le nouveau mot de passe est obligatoire."),
    confirmPassword: z.string(),
    mode: z.enum(["required", "voluntary"]).default("voluntary"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "La confirmation ne correspond pas.",
  });

/**
 * Changes the current user's password. In `required` mode (first sign-in), redirects to the
 * home page with a success toast; otherwise returns a success state.
 */
export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
    mode: formData.get("mode") ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message,
      fields: issue ? { [String(issue.path[0])]: issue.message } : undefined,
    };
  }
  try {
    await changeOwnPassword(parsed.data.currentPassword, parsed.data.newPassword);
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
  if (parsed.data.mode === "required") redirect("/?flash=password_changed");
  return { ok: true, tick: Date.now() };
}
