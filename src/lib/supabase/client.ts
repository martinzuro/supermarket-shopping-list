import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Supabase client for Client Components.
 *
 * In the browser @supabase/ssr returns a singleton, so every call gets the
 * same instance, the same session and the same Realtime connection. The
 * session is stored in cookies (not localStorage) so the /auth/callback route
 * handler can read the PKCE verifier and write the confirmed session.
 *
 * Throws when NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * were not set at build time.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

export type BrowserSupabaseClient = ReturnType<typeof createClient>;
