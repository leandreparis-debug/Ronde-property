import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { controlClassName } from "./input";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native <select> with RONDE styling. The native picker is the most reliable choice
 * on tablets, so V1 does not use a custom listbox.
 *
 * @example
 * <Select {...control}><option value="periodic">Visite périodique</option></Select>
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        className={cn(controlClassName, "h-11 appearance-none pr-11", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-ink-2"
        aria-hidden="true"
      />
    </span>
  );
});
