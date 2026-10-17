import type { MetadataRoute } from "next";

// Neutral placeholder colors; update when the design tokens land.
const THEME_COLOR = "#16a34a";
const BACKGROUND_COLOR = "#ffffff";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lista",
    short_name: "Lista",
    description: "Listas de compras de supermercado.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
