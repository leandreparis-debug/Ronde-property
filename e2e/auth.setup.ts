import { test as setup } from "@playwright/test";

import { loginAs, STORED_ROLES, storageStatePath } from "./helpers/auth";

for (const role of STORED_ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.context().clearCookies();
    await loginAs(page, role);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
