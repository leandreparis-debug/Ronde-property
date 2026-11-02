import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

describe("Field", () => {
  it("links the label, the hint and the error to the control", () => {
    render(
      <Field id="site" label="Site" hint="Code VIGIE" error="Le site est obligatoire." required>
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText(/Site/);
    expect(input).toHaveAttribute("id", "site");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAttribute("aria-describedby", "site-error site-hint");
    expect(input).toHaveAccessibleDescription("Le site est obligatoire. Code VIGIE");
    expect(screen.getByRole("alert")).toHaveTextContent("Le site est obligatoire.");
    expect(screen.getByText("(obligatoire)")).toBeInTheDocument();
  });

  it("omits aria-describedby and aria-invalid without hint or error", () => {
    render(
      <Field id="motive" label="Motif">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Motif");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
