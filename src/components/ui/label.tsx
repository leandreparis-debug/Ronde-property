import { forwardRef, type LabelHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Append a visible « (obligatoire) » marker. */
  required?: boolean;
}

/**
 * Form label. The required marker is written out in words, never by colour alone.
 */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, required, children, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn("inline-block text-ui font-semibold text-ink", className)}
      {...props}
    >
      {children}
      {required ? <span className="ml-1 font-normal text-ink-2">(obligatoire)</span> : null}
    </label>
  );
});
