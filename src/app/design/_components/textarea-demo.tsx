"use client";

import { useState } from "react";

import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/** Auto-growing textarea with live content. */
export function TextareaDemo() {
  const [value, setValue] = useState(
    "Quai 14 : butoir gauche arraché, câblage apparent.\nQuai 15 : butoir fissuré.",
  );
  return (
    <Field id="demo-note" label="Note de zone" hint="La hauteur suit le contenu.">
      {(control) => (
        <Textarea {...control} value={value} onChange={(event) => setValue(event.target.value)} />
      )}
    </Field>
  );
}
