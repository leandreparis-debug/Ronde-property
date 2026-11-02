import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RESERVE_STATUS_LABELS, StatusPill } from "@/components/ui/status-pill";

describe("StatusPill", () => {
  it.each([
    ["open", "Ouverte"],
    ["in_progress", "En cours"],
    ["done", "Levée"],
  ] as const)("shows the label of the %s status", (status, label) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveAttribute("data-status", status);
    expect(RESERVE_STATUS_LABELS[status]).toBe(label);
  });

  it("shows « En retard » with the open styling when overdue", () => {
    render(<StatusPill status="in_progress" overdue />);
    const pill = screen.getByText("En retard");
    expect(pill).toHaveAttribute("data-overdue", "true");
    expect(pill.className).toContain("bg-status-open-bg");
  });

  it("always renders a dot next to the text", () => {
    const { container } = render(<StatusPill status="done" />);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(container.textContent).toBe("Levée");
  });
});
