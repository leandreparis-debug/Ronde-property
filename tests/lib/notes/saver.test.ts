import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNoteSaver, type NoteSaveOutcome, type NoteSaveStatus } from "@/lib/notes/saver";

function setup(save: (id: string, version: number, content: string) => Promise<NoteSaveOutcome>) {
  const statuses: NoteSaveStatus["kind"][] = [];
  const saved: string[] = [];
  const conflicts: string[] = [];
  let version = 1;
  const saver = createNoteSaver({
    save,
    getVersion: () => version,
    onSaved: (_id, v, _at, content) => {
      version = v;
      saved.push(content);
    },
    onConflict: (_id, mine) => conflicts.push(mine),
    onStatus: (_id, status) => statuses.push(status.kind),
  });
  return { saver, statuses, saved, conflicts, version: () => version };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createNoteSaver", () => {
  it("saves 800 ms after the last change, with the latest text only", async () => {
    const save = vi.fn(async (_id: string, version: number) => ({
      ok: true as const,
      version: version + 1,
      savedAt: "2026-11-02T10:00:00.000Z",
    }));
    const { saver, saved, statuses } = setup(save);
    saver.track("n1", "");
    saver.change("n1", "T");
    saver.change("n1", "To");
    saver.change("n1", "Toiture");
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("n1", 1, "Toiture");
    expect(saved).toEqual(["Toiture"]);
    expect(statuses).toEqual(["saving", "saved"]);
    expect(saver.hasPending()).toBe(false);
  });

  it("keeps the text and retries after 1 s, 2 s, 5 s, 10 s then 30 s until the server is back", async () => {
    let failures = 5;
    const save = vi.fn(async (_id: string, version: number, content: string) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("fetch failed");
      }
      return { ok: true as const, version: version + 1, savedAt: `saved:${content}` };
    });
    const { saver, saved, statuses } = setup(save);
    saver.track("n1", "");
    saver.change("n1", "Texte précieux");
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("offline");
    expect(saver.pendingIds()).toEqual(["n1"]);

    for (const [delay, calls] of [
      [1000, 2],
      [2000, 3],
      [5000, 4],
      [10_000, 5],
      [30_000, 6],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(save).toHaveBeenCalledTimes(calls - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(save).toHaveBeenCalledTimes(calls);
    }
    expect(saved).toEqual(["Texte précieux"]);
    expect(statuses.at(-1)).toBe("saved");
    expect(saver.hasPending()).toBe(false);
  });

  it("treats a retryable server failure like an outage and a refusal as a final error", async () => {
    const save = vi
      .fn<(id: string, version: number, content: string) => Promise<NoteSaveOutcome>>()
      .mockResolvedValueOnce({ ok: false, error: "Panne", retryable: true })
      .mockResolvedValueOnce({ ok: false, error: "Vous n'avez pas le droit." });
    const { saver, statuses } = setup(save);
    saver.track("n1", "");
    saver.change("n1", "A");
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe("offline");
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses.at(-1)).toBe("error");
    expect(saver.hasPending()).toBe(true);
  });

  it("flushes immediately, saves again if the text changed during the request", async () => {
    let resolveFirst: ((outcome: NoteSaveOutcome) => void) | null = null;
    const save = vi.fn(
      (_id: string, version: number) =>
        new Promise<NoteSaveOutcome>((resolve) => {
          if (!resolveFirst) resolveFirst = resolve;
          else resolve({ ok: true, version: version + 1, savedAt: "later" });
        }),
    );
    const { saver, saved } = setup(save);
    saver.track("n1", "");
    saver.change("n1", "Premier");
    saver.flush("n1");
    expect(save).toHaveBeenCalledTimes(1);
    saver.change("n1", "Premier puis second");
    resolveFirst!({ ok: true, version: 2, savedAt: "first" });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("n1", 2, "Premier puis second");
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(["Premier", "Premier puis second"]);
  });

  it("stops on a conflict until the user decides, then saves on the new version", async () => {
    const save = vi
      .fn<(id: string, version: number, content: string) => Promise<NoteSaveOutcome>>()
      .mockResolvedValueOnce({
        ok: false,
        error: "Bruno a modifié cette zone entre-temps.",
        conflict: { content: "Sa version", version: 3, updatedAt: "t", updatedByName: "Bruno" },
      })
      .mockResolvedValue({ ok: true, version: 4, savedAt: "t2" });
    const { saver, conflicts, saved } = setup(save);
    saver.track("n1", "");
    saver.change("n1", "Ma version");
    await vi.advanceTimersByTimeAsync(800);
    expect(conflicts).toEqual(["Ma version"]);
    saver.change("n1", "Ma version corrigée");
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    saver.retry("n1");
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(["Ma version corrigée"]);
  });

  it("flushes every pending note and reports them", async () => {
    const save = vi.fn(async (_id: string, version: number) => ({
      ok: true as const,
      version: version + 1,
      savedAt: "t",
    }));
    const { saver } = setup(save);
    saver.track("a", "");
    saver.track("b", "");
    saver.change("a", "A");
    saver.change("b", "B");
    expect(saver.pendingIds().sort()).toEqual(["a", "b"]);
    saver.flushAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.hasPending()).toBe(false);
  });
});
