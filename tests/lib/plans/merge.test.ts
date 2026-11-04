import { describe, expect, it } from "vitest";

import { mergeSnapshot } from "@/lib/plans/merge";

const at = (minute: number) => `2026-11-04T10:${String(minute).padStart(2, "0")}:00.000Z`;

describe("mergeSnapshot", () => {
  it("drops a marker deleted by another user (absent from a snapshot taken after it)", () => {
    const local = [
      { id: "a", updatedAt: at(1) },
      { id: "deleted-elsewhere", updatedAt: at(2) },
    ];
    const server = { items: [{ id: "a", updatedAt: at(1) }], snapshotAt: at(5) };
    expect(mergeSnapshot(local, server).map((m) => m.id)).toEqual(["a"]);
  });

  it("keeps a marker created locally after the snapshot (stale answer arriving late)", () => {
    const local = [
      { id: "a", updatedAt: at(1) },
      { id: "new", updatedAt: at(6) },
    ];
    const stale = { items: [{ id: "a", updatedAt: at(1) }], snapshotAt: at(5) };
    expect(mergeSnapshot(local, stale).map((m) => m.id)).toEqual(["a", "new"]);
  });

  it("never lets a stale answer overwrite a more recent local change", () => {
    const local = [{ id: "a", updatedAt: at(7), label: "local, plus récent" }];
    const stale = { items: [{ id: "a", updatedAt: at(3), label: "périmé" }], snapshotAt: at(5) };
    expect(mergeSnapshot(local, stale)[0]?.label).toBe("local, plus récent");
    const fresh = { items: [{ id: "a", updatedAt: at(9), label: "serveur" }], snapshotAt: at(10) };
    expect(mergeSnapshot(local, fresh)[0]?.label).toBe("serveur");
  });

  it("adds markers created elsewhere and never brings back a marker removed locally", () => {
    const local = [{ id: "a", updatedAt: at(1) }];
    const server = {
      items: [
        { id: "a", updatedAt: at(1) },
        { id: "gone", updatedAt: at(1) },
        { id: "other", updatedAt: at(2) },
      ],
      snapshotAt: at(3),
    };
    expect(mergeSnapshot(local, server, new Set(["gone"])).map((m) => m.id)).toEqual([
      "a",
      "other",
    ]);
  });
});
