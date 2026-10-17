import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Supabase client for Route Handlers and Server Functions, bound to the
 * request's cookies. Create one per request; never share it.
 *
 * Reading `cookies()` makes the caller request-time. Do not call this from a
 * layout or from a page outside a `<Suspense>` boundary: with Cache
 * Components that blocks the static shell (the app reads the session in the
 * browser, see src/components/session-provider.tsx).
 *
 * There is no proxy refreshing tokens on every request: the browser client
 * refreshes its own session, and server code only uses this client where it
 * can write cookies (the auth callback).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Only Route Handlers and
            // Server Functions write a session with this client.
          }
        },
      },
    },
  );
}
