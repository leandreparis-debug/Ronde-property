"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 font-sans text-ui font-semibold whitespace-nowrap",
    "transition-colors select-none",
    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-busy:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:bg-brand-deep active:bg-brand-deep",
        secondary:
          "border border-rule bg-paper text-ink hover:bg-craie focus-visible:outline-brand active:bg-galet",
        ghost: "bg-transparent text-ink hover:bg-galet active:bg-rule",
        danger: "bg-status-open text-on-brand hover:opacity-90 active:opacity-80",
      },
      size: {
        md: "h-11 min-w-11", // 44 px
        lg: "h-13 min-w-13 px-5 text-body", // 52 px
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a <button> (e.g. a Next.js <Link>). */
  asChild?: boolean;
  /** Show a spinner, mark the button busy and prevent interaction. */
  loading?: boolean;
}

/**
 * Primary interactive control. Touch-first: 44 px high by default, 52 px in `lg`.
 * `danger` is reserved for deletions.
 *
 * @example
 * <Button variant="secondary" onClick={save}>Enregistrer</Button>
 * <Button asChild><Link href="/visites">Mes visites</Link></Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={props.type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" data-testid="spinner" />
      ) : null}
      {children}
    </button>
  );
});
