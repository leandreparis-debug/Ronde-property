import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GALET_MOODS, Galet, resolveGaletMood } from "@/components/brand/Galet";

describe("Galet", () => {
  it.each(GALET_MOODS)("renders the %s mood", (mood) => {
    const { container } = render(<Galet mood={mood} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("data-mood", mood);
    expect(svg?.querySelector("path")).toHaveAttribute("fill", "var(--color-brand)");
  });

  it("is hidden from assistive technologies without a label", () => {
    const { container } = render(<Galet />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("is exposed as an image with its label", () => {
    render(<Galet mood="happy" label="Galet content" />);
    const img = screen.getByRole("img", { name: "Galet content" });
    expect(img).not.toHaveAttribute("aria-hidden");
  });

  it("falls back to neutral for an unknown mood", () => {
    const { container } = render(<Galet mood="angry" />);
    expect(container.querySelector("svg")).toHaveAttribute("data-mood", "neutral");
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("applies the requested size and colour", () => {
    const { container } = render(<Galet size={96} color="var(--color-ink)" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "96");
    expect(svg).toHaveAttribute("height", "96");
    expect(svg?.querySelector("path")).toHaveAttribute("fill", "var(--color-ink)");
  });

  it("only blinks for neutral and attentive", () => {
    const neutral = render(<Galet mood="neutral" blink />).container;
    expect(neutral.querySelector(".galet-blink")).not.toBeNull();
    const asleep = render(<Galet mood="asleep" blink />).container;
    expect(asleep.querySelector(".galet-blink")).toBeNull();
  });
});

describe("resolveGaletMood", () => {
  it("accepts known moods and rejects anything else", () => {
    expect(resolveGaletMood("worried")).toBe("worried");
    expect(resolveGaletMood("unknown")).toBe("neutral");
    expect(resolveGaletMood(undefined)).toBe("neutral");
    expect(resolveGaletMood(42)).toBe("neutral");
  });
});
