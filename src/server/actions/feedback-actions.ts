"use server";

import { revalidatePath } from "next/cache";

import { userMessage } from "@/server/errors";
import { submitFeedback } from "@/server/services/feedback";

import type { ActionState } from "./state";

/** « Donner mon avis »: records the feedback of the current user. Only the rating is required. */
export async function submitFeedbackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await submitFeedback({
      rating: formData.get("rating") ?? undefined,
      works: String(formData.get("works") ?? ""),
      blocks: String(formData.get("blocks") ?? ""),
      pagePath: String(formData.get("pagePath") ?? "/"),
      viewport: String(formData.get("viewport") ?? "") || undefined,
    });
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
  revalidatePath("/admin/avis");
  return { ok: true, tick: Date.now() };
}
