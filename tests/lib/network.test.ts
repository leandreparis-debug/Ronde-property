import { describe, expect, it } from "vitest";

import { OFFLINE_ERROR, reachServer } from "@/lib/network";

describe("reachServer", () => {
  it("returns the result of the action", async () => {
    await expect(reachServer(async () => ({ ok: true as const, id: "x" }))).resolves.toEqual({
      ok: true,
      id: "x",
    });
  });

  it("turns a network failure into an offline result", async () => {
    await expect(
      reachServer(async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).resolves.toEqual({ ok: false, error: OFFLINE_ERROR, offline: true });
  });
});
