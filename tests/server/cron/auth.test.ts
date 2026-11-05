import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "@/server/cron/auth";

const SECRET = "cron-secret-fictif-de-32-caracteres-000";

describe("isAuthorizedCronRequest", () => {
  it("accepts exactly « Bearer <secret> »", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["another secret", "Bearer cron-secret-fictif-de-32-caracteres-001"],
    ["the bare secret", SECRET],
    ["a lower-case scheme", `bearer ${SECRET}`],
    ["a trailing space", `Bearer ${SECRET} `],
  ])("refuses %s", (_label, header) => {
    expect(isAuthorizedCronRequest(header, SECRET)).toBe(false);
  });

  it("refuses everyone when no secret (or a short one) is configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer court", "court")).toBe(false);
  });
});
