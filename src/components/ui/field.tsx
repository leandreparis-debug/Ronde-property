import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Label } from "./label";

/** Attributes to spread on the form control rendered inside a <Field>. */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
}

export interface FieldProps {
  /** Id of the control; also used to derive the hint and error ids. */
  id: string;
  label: ReactNode;
  /** Help text displayed under the control. */
  hint?: ReactNode;
  /** Validation message. Rendered with an icon and text, never by colour alone. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Render function receiving the accessibility attributes to spread on the control. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Groups a label, a control, an optional hint and an optional error message.
 * Hint and error are linked to the control through `aria-describedby`.
 *
 * @example
 * <Field id="site" label="Site" hint="Code VIGIE" error={errors.site}>
 *   {(control) => <Input {...control} value={site} onChange={…} />}
 * </Field>
 */
export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children(control)}
      {hint ? (
        <p id={hintId} className="text-ui text-ink-2">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-ui font-medium text-status-open"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
