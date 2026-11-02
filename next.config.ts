import type { NextConfig } from "next";

/**
 * Security headers applied to every route.
 * The camera is allowed for the same origin only: photos are taken from the tablet (step 7).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
