import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { env } from "@/lib/env";

import "./globals.css";

/**
 * Fonts are self-hosted at build time by `next/font/google`: no runtime request
 * leaves the application, which matters for the closed-network V2 deployment.
 */
const displayFont = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  weight: "700",
  display: "swap",
  variable: "--font-bricolage-grotesque",
  fallback: ["ui-sans-serif", "system-ui", "Arial", "sans-serif"],
});

const sansFont = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  display: "swap",
  variable: "--font-instrument-sans",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

const handFont = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: "700",
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F6F4",
};

/**
 * Root layout: French document language, self-hosted fonts exposed as CSS variables,
 * global styles.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={`${sansFont.variable} ${displayFont.variable} ${handFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
