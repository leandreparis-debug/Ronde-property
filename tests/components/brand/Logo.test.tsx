import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "@/components/brand/Logo";

describe("Logo", () => {
  it("renders the mascot and the wordmark", () => {
    const { container } = render(<Logo />);
    expect(screen.getByText("ronde")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("names the mascot when the wordmark is hidden", () => {
    render(<Logo showWordmark={false} />);
    expect(screen.getByRole("img", { name: "RONDE" })).toBeInTheDocument();
    expect(screen.queryByText("ronde")).toBeNull();
  });

  it("uses light colours in mono-light tone", () => {
    const { container } = render(<Logo tone="mono-light" />);
    expect(container.querySelector("path")).toHaveAttribute("fill", "var(--color-craie)");
    expect(container.querySelector("g")).toHaveAttribute("fill", "var(--color-ink)");
  });
});
