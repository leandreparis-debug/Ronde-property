import { type BrowserContext, test as base } from "@playwright/test";

export { expect } from "@playwright/test";

/** Reports every CSP violation of a page as a console error the guard can read. */
const REPORTER = `document.addEventListener("securitypolicyviolation", (event) => {
  console.error("[csp-violation] " + event.violatedDirective + " " + (event.blockedURI || "inline") + " " + (event.sourceFile || ""));
});`;

/**
 * Playwright `test` that fails when any page of the test (default context or contexts the test
 * creates itself) violates the Content-Security-Policy.
 */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ browser, context }, use, testInfo) => {
      const violations: string[] = [];
      const watch = async (watched: BrowserContext) => {
        await watched.addInitScript(REPORTER);
        watched.on("console", (message) => {
          const text = message.text();
          if (
            message.type() === "error" &&
            (text.startsWith("[csp-violation]") || /Content Security Policy/i.test(text))
          ) {
            violations.push(text);
          }
        });
      };
      await watch(context);
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...args) => {
        const created = await newContext(...args);
        await watch(created);
        return created;
      };
      await use();
      browser.newContext = newContext;
      if (violations.length > 0) {
        await testInfo.attach("csp-violations", { body: violations.join("\n") });
        throw new Error(`Violations de la CSP :\n${violations.join("\n")}`);
      }
    },
    { auto: true },
  ],
});
