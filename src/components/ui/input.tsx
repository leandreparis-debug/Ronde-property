import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Shared appearance of text-like controls (input, textarea, select). */
export const controlClassName = cn(
  "w-full rounded-md border border-rule bg-paper px-3.5 text-body text-ink",
  "placeholder:text-ink-2",
  "hover:border-ink-2",
  "focus-visible:border-brand focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-brand",
  "aria-invalid:border-status-open aria-invalid:focus-visible:outline-status-open",
  "disabled:cursor-not-allowed disabled:bg-craie disabled:text-ink-2 disabled:opacity-70",
);

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Single-line text field, 44 px high. Pair it with <Field> for label, hint and error.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input ref={ref} type={type} className={cn(controlClassName, "h-11", className)} {...props} />
  );
});
