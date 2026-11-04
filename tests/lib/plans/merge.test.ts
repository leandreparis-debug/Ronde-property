import { describe, expect, it } from "vitest";

import { mergeByVersion } from "@/lib/plans/merge";

const at = (minute: number) => `2026-11-04T10:${String(minute).padStart(2, "0")}:00.000Z`;

describe("mergeByVersion", () => {
  it("keeps a marker created locally when a stale server list arrives afterwards", () => {
    const local = [
      { id: "a", updatedAt: at(1) },
      { id: "new", updatedAt: at(5) },
    ];
    const staleServer = [{ id: "a", updatedAt: at(1) }];
    expect(mergeByVersion(local, staleServer).map((m) => m.id)).toEqual(["a", "new"]);
  });

  it("takes the most recent version of an item present on both sides", () => {
    const local = [{ id: "a", updatedAt: at(3), label: "local" }];
    expect(mergeByVersion(local, [{ id: "a", updatedAt: at(2), label: "old" }])[0]?.label).toBe(
      "local",
    );
    expect(mergeByVersion(local, [{ id: "a", updatedAt: at(4), label: "server" }])[0]?.label).toBe(
      "server",
    );
  });

  it("never brings back an item removed locally, and adds items created elsewhere", () => {
    const local = [{ id: "a", updatedAt: at(1) }];
    const server = [
      { id: "a", updatedAt: at(1) },
      { id: "gone", updatedAt: at(1) },
      { id: "other", updatedAt: at(2) },
    ];
    expect(mergeByVersion(local, server, new Set(["gone"])).map((m) => m.id)).toEqual([
      "a",
      "other",
    ]);
  });
});
