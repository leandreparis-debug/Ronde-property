import { expect } from "@playwright/test";

import { E2E_ENV } from "../playwright.config";
import { E2E_BASE_URL, storageStatePath } from "./helpers/auth";
import { test } from "./helpers/csp";

/* Scheduled purge (`vercel.json`): callable only with `Authorization: Bearer <CRON_SECRET>`. */

test.describe("/api/cron/purge", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("answers 401 without the secret, even to a signed-in user, and never redirects", async ({
    request,
    browser,
  }) => {
    for (const authorization of [
      undefined,
      "Bearer mauvais-secret-de-trente-deux-caracteres-00",
      E2E_ENV.CRON_SECRET,
      `Basic ${E2E_ENV.CRON_SECRET}`,
    ]) {
      const response = await request.get("/api/cron/purge", {
        headers: authorization ? { authorization } : {},
        maxRedirects: 0,
      });
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Non autorisé." });
    }
    const signedIn = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("david"),
    });
    const asAdmin = await signedIn.request.get("/api/cron/purge", { maxRedirects: 0 });
    expect(asAdmin.status()).toBe(401);
    await signedIn.close();
  });

  test("purges with the secret and reports what it removed", async ({ request }) => {
    const response = await request.get("/api/cron/purge", {
      headers: { authorization: `Bearer ${E2E_ENV.CRON_SECRET}` },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      photos: expect.any(Number),
      plans: expect.any(Number),
      reports: expect.any(Number),
      objectFailures: 0,
    });
  });
});
