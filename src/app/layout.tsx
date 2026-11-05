import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { ZodJitless } from "@/components/zod-jitless";
import { BRAND_COLORS } from "@/lib/brand-colors";
import { env } from "@/lib/env";
import { startupImages } from "@/lib/pwa";

import "./globals.css";

/**
 * Fonts are local files (`public/fonts/web/`, OFL): neither the build nor the browser ever
 * contacts Google or a CDN, which the closed-network V2 server requires (step 11).
 */
const displayFont = localFont({
  src: "../../public/fonts/web/BricolageGrotesque-Bold.woff2",
  weight: "700",
  style: "normal",
  display: "swap",
  variable: "--font-bricolage-grotesque",
  fallback: ["ui-sans-serif", "system-ui", "Arial", "sans-serif"],
});

const sansFont = localFont({
  src: "../../public/fonts/web/InstrumentSans-Variable.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-instrument-sans",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

const handFont = localFont({
  src: "../../public/fonts/web/Caveat-Bold.woff2",
  weight: "700",
  style: "normal",
  display: "swap",
  variable: "--font-caveat",
  fallback: ["Segoe Print", "Bradley Hand", "cursive"],
});

export const metadata: Metadata = {
  title: {
    default: env.NEXT_PUBLIC_APP_NAME,
    template: `%s · ${env.NEXT_PUBLIC_APP_NAME}`,
  },
  applicationName: env.NEXT_PUBLIC_APP_NAME,
  description: "Visites de site des Responsables Techniques de Carrefour Property.",
  // Installed on an iPad home screen: full screen, light status bar, splash screens.
  appleWebApp: {
    capable: true,
    title: env.NEXT_PUBLIC_APP_NAME,
    statusBarStyle: "default",
    startupImage: startupImages(),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND_COLORS.craie,
};

/**
 * Root layout: French document language, self-hosted fonts exposed as CSS variables,
 * global styles. Every page is rendered per request (`connection()`), so that Next.js can put
 * the CSP nonce of the request on its scripts (see src/middleware.ts).
 */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  return (
    <html lang="fr" className={`${sansFont.variable} ${displayFont.variable} ${handFont.variable}`}>
      <body>
        <ZodJitless />
        {children}
      </body>
    </html>
  );
}
