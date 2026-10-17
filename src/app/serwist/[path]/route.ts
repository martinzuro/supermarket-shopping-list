import { createSerwistRoute } from "@serwist/turbopack";

// Serves the compiled service worker at /serwist/sw.js (built with esbuild).
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/offline", revision: "1" }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
