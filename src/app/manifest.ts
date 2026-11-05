import type { MetadataRoute } from "next";

import { BRAND_COLORS } from "@/lib/brand-colors";

/**
 * Web app manifest (`/manifest.webmanifest`): RONDE can be installed on the home screen of a
 * tablet or a computer and opens without the browser bar. Colours come from the tokens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RONDE",
    short_name: "RONDE",
    description: "Visites de site des Responsables Techniques de Carrefour Property.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BRAND_COLORS.craie,
    theme_color: BRAND_COLORS.craie,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
