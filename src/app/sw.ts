import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

// Declares the value of `injectionPoint` to TypeScript. Serwist replaces
// `self.__SW_MANIFEST` with the actual precache manifest at build time.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Installability and fast loading only, not offline data: the app shell and
// static assets are precached, and a static page is the navigation fallback.
// Rules are matched in order, so the NetworkOnly rule goes first. It keeps
// API routes and every cross-origin request (Supabase REST, Auth and
// Realtime) out of the caches, which `defaultCache` would otherwise store.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) =>
        !sameOrigin || url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
