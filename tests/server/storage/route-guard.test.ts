// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    STORAGE_PROVIDER: "supabase",
    LOCAL_STORAGE_SECRET: undefined,
    LOCAL_STORAGE_DIR: ".storage",
  },
}));

describe("the local storage route under another provider", () => {
  it("answers 404 to every request when STORAGE_PROVIDER is not local", async () => {
    const { GET, PUT } = await import("@/app/api/local-storage/[...path]/route");
    const context = { params: Promise.resolve({ path: ["visit-photos", "a.jpg"] }) };
    const get = await GET(
      new Request("http://ronde.test/api/local-storage/visit-photos/a.jpg"),
      context,
    );
    expect(get.status).toBe(404);
    const put = await PUT(
      new Request("http://ronde.test/api/local-storage/visit-photos/a.jpg", {
        method: "PUT",
        body: "x",
      }),
      context,
    );
    expect(put.status).toBe(404);
  });
});
