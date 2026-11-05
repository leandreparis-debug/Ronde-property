import type { NextConfig } from "next";

import packageJson from "./package.json" with { type: "json" };

/**
 * Security headers applied to every route (the Content-Security-Policy, which carries a nonce
 * per request, is set by src/middleware.ts). The camera is the only device feature allowed,
 * for the same origin: photos are taken from the tablet (step 7). HSTS is ignored by browsers
 * over plain HTTP (local and e2e servers).
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), display-capture=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shown in the account menu and on /aide (src/lib/version.ts).
  env: { NEXT_PUBLIC_APP_VERSION: packageJson.version },
  // /aide reads the guides from docs/ at request time: ship them with the function.
  outputFileTracingIncludes: { "/aide/[guide]": ["./docs/guide-*.md"] },
  poweredByHeader: false,
  experimental: {
    // `forbidden()` renders src/app/forbidden.tsx with a 403 status (requireRole).
    authInterrupts: true,
    // Vercel caps request bodies at 4.5 MB: the CSV import stays under 4 MB (checked server-side).
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
