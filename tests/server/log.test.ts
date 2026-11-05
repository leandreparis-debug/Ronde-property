import { describe, expect, it } from "vitest";

import { createLogger, maskLogData, maskText } from "@/server/log";

function capture() {
  const lines: { level: string; data: Record<string, unknown> }[] = [];
  const logger = createLogger((level, line) => lines.push({ level, data: JSON.parse(line) }));
  return { logger, lines };
}

describe("server logger", () => {
  it("writes one JSON line with level, event and time", () => {
    const { logger, lines } = capture();
    logger.warn("photos.upload_retry", { attempt: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.level).toBe("warn");
    expect(lines[0]!.data).toMatchObject({
      level: "warn",
      event: "photos.upload_retry",
      attempt: 2,
    });
    expect(Date.parse(String(lines[0]!.data.at))).not.toBeNaN();
  });

  it("masks secrets by key, at any depth", () => {
    const masked = maskLogData({
      password: "Ronde-test-2026",
      newPassword: "x",
      headers: { authorization: "Bearer abc", cookie: "sb=1", "x-api-key": "k" },
      nested: [{ accessToken: "t", refresh_token: "r", serviceRoleKey: "s" }],
      LOCAL_STORAGE_SECRET: "s".repeat(40),
      status: 500,
    });
    const text = JSON.stringify(masked);
    for (const secret of ["Ronde-test-2026", "Bearer abc", "sb=1", '"t"', '"r"', "ssss"]) {
      expect(text).not.toContain(secret);
    }
    expect(masked.status).toBe(500);
    expect(masked.password).toBe("[masqué]");
  });

  it("replaces e-mails by their audit hash, in keys and in free text", () => {
    const masked = maskLogData({
      email: "RT.Alice@example.test",
      message: "Compte rt.alice@example.test introuvable",
    });
    expect(JSON.stringify(masked)).not.toMatch(/alice@/i);
    expect(masked.email).toMatch(/^email:[0-9a-f]{16}$/);
    expect(masked.message).toBe(`Compte ${masked.email} introuvable`);
  });

  it("masks JWTs, Supabase keys and the query of signed URLs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl";
    const text = maskText(
      `jeton ${jwt} clé sb_secret_abcdefghijkl url https://projet.supabase.co/storage/v1/object/sign/photos/a.jpg?token=${jwt}&download=1`,
    );
    expect(text).not.toContain("eyJ");
    expect(text).not.toContain("sb_secret_");
    expect(text).not.toContain("token=");
    expect(text).toContain(
      "https://projet.supabase.co/storage/v1/object/sign/photos/a.jpg?[paramètres masqués]",
    );
  });

  it("serialises errors without their SQL detail, and survives cycles", () => {
    const error = Object.assign(new Error("duplicate key value for rt.bruno@example.test"), {
      code: "23505",
      detail: "Key (email)=(rt.bruno@example.test) already exists.",
      parameters: ["rt.bruno@example.test", "Ronde-test-2026"],
    });
    const cyclic: Record<string, unknown> = { name: "boucle" };
    cyclic.self = cyclic;
    const { logger, lines } = capture();
    logger.error("unexpected_error", { error, cyclic });
    const line = JSON.stringify(lines[0]!.data);
    expect(line).not.toMatch(/bruno@|Ronde-test-2026|Key \(email\)/);
    expect(lines[0]!.data.error).toMatchObject({ name: "Error", code: "23505" });
    expect(line).toContain("[circulaire]");
  });

  it("stays silent in tests without a sink", () => {
    expect(() => createLogger().error("silence")).not.toThrow();
  });
});
