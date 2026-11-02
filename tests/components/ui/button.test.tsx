import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it.each(["primary", "secondary", "ghost", "danger"] as const)(
    "renders the %s variant",
    (variant) => {
      render(<Button variant={variant}>Action</Button>);
      const button = screen.getByRole("button", { name: "Action" });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("type", "button");
    },
  );

  it("uses a 44 px height by default and 52 px in lg", () => {
    render(
      <>
        <Button>Moyen</Button>
        <Button size="lg">Grand</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Moyen" }).className).toContain("h-11");
    expect(screen.getByRole("button", { name: "Grand" }).className).toContain("h-13");
  });

  it("is disabled and busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Enregistrer
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Enregistrer" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when enabled", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Valider</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the child element with asChild", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/reserves">Mes réserves</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Mes réserves" });
    expect(link).toHaveAttribute("href", "/reserves");
    expect(link.className).toContain("bg-paper");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
