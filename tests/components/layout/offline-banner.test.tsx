import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BACK_ONLINE_MS, OfflineBanner } from "@/components/layout/offline-banner";

let online = true;

function goOffline() {
  online = false;
  window.dispatchEvent(new Event("offline"));
}

function goOnline() {
  online = true;
  window.dispatchEvent(new Event("online"));
}

beforeEach(() => {
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("shows nothing while online", () => {
    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    expect(screen.queryByTestId("online-banner")).toBeNull();
  });

  it("explains that the changes stay on the device while offline, in a live region", () => {
    render(<OfflineBanner />);
    act(goOffline);
    const banner = screen.getByTestId("offline-banner");
    expect(banner.textContent).toContain("Hors réseau.");
    expect(banner.textContent).toContain("Vos saisies sont gardées sur cet appareil");
    expect(banner.textContent).toContain("au retour du réseau");
    expect(banner.closest("[role=status]")).not.toBeNull();
    expect(screen.getByRole("link", { name: "En savoir plus" }).getAttribute("href")).toBe(
      "/hors-ligne",
    );
  });

  it("says « Connexion rétablie » for a few seconds once the network is back", () => {
    vi.useFakeTimers();
    render(<OfflineBanner />);
    act(goOffline);
    act(goOnline);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    expect(screen.getByTestId("online-banner").textContent).toContain("Connexion rétablie");
    act(() => vi.advanceTimersByTime(BACK_ONLINE_MS + 10));
    expect(screen.queryByTestId("online-banner")).toBeNull();
  });
});
