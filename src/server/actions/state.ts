/** Shape returned by form actions driven by `useActionState`. */
export interface ActionState {
  ok: boolean;
  error?: string;
  /** Field-level messages, keyed by input name. */
  fields?: Record<string, string>;
  /** Monotonic counter so that identical successive results still trigger effects. */
  tick?: number;
}

export const initialActionState: ActionState = { ok: false };
