import type { MetadataRoute } from "next";

// Matches the light paper token in globals.css (--paper).
const THEME_COLOR = "#f6f3ec";
const BACKGROUND_COLOR = "#f6f3ec";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // The app's identity for the browser, apart from start_url: it stays the
    // same if the start URL ever changes, so installed copies keep updating.
    id: "/",
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
