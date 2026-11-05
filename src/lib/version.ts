/**
 * Version of the application (`package.json`), injected at build time by next.config.ts. Shown
 * in the account menu and on /aide, stored with every feedback.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
