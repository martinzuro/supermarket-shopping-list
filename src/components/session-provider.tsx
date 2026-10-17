"use client";

import {
  isAuthApiError,
  isAuthRetryableFetchError,
  type User,
} from "@supabase/supabase-js";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { retryDelay } from "@/lib/auth";
import {
  createClient,
  type BrowserSupabaseClient,
} from "@/lib/supabase/client";

/**
 * - `loading`: the first session check is running, or a new anonymous user is
 *   being created (first use, after signing out).
 * - `ready`: there is a session. `user` is set. A session restored from
 *   cookies is `ready` right away and turns `offline` if the server does not
 *   answer the check that follows.
 * - `offline`: Supabase cannot be reached (no network, Supabase down or not
 *   configured) or the browser reports it is offline. `user` keeps the known
 *   user, if any, so cached data can stay on screen. Retries run with backoff
 *   on their own; `retrySession()` retries now.
 */
export type SessionStatus = "loading" | "ready" | "offline";

export type SessionState = {
  status: SessionStatus;
  /** Current Supabase user. `user.is_anonymous` tells a guest from an account. */
  user: User | null;
};

// The browser client is a singleton, and so is its session: the state lives
// in a module-level store that components read with useSyncExternalStore.
const SERVER_STATE: SessionState = { status: "loading", user: null };
let state: SessionState = SERVER_STATE;
const listeners = new Set<() => void>();

function setState(next: Partial<SessionState>) {
  const merged = { ...state, ...next };
  if (merged.status === state.status && merged.user === state.user) return;
  state = merged;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => SERVER_STATE;

/**
 * Session state for Client Components. Renders `loading` on the server and
 * during hydration. Needs a mounted SessionProvider to ever leave `loading`.
 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

let retryNow: () => void = () => {};

/** Retries now, resetting the backoff (the "Reintentar" button). */
export function retrySession() {
  retryNow();
}

type Established =
  { user: User; restored: boolean } | { user: null; error: unknown };

// Shared across mounts so a remount (React Strict Mode, fast refresh) never
// creates a second anonymous user while the first sign-in is in flight.
let establishing: Promise<Established> | null = null;

function establishSession(supabase: BrowserSupabaseClient) {
  establishing ??= (async (): Promise<Established> => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) return { user: data.session.user, restored: true };
      // A network failure while refreshing keeps the stored session. Wait and
      // retry instead of replacing it with a new anonymous user (and list).
      if (error && isAuthRetryableFetchError(error))
        return { user: null, error };

      const anonymous = await supabase.auth.signInAnonymously();
      if (anonymous.data.user) {
        return { user: anonymous.data.user, restored: false };
      }
      return { user: null, error: anonymous.error };
    } catch (error) {
      return { user: null, error };
    }
  })().finally(() => {
    establishing = null;
  });
  return establishing;
}

type CheckResult = "ok" | "unreachable" | "restart";

/**
 * Checks a session restored from cookies against the server. It is also the
 * reachability probe: a stored session works without the network, so this is
 * what tells "ready" from "offline" for a returning user.
 *
 * - It can outlive its user (deleted, or the local database was reset): drop
 *   it and start over as a new anonymous user.
 * - The user may have been converted elsewhere (the email link opened in
 *   another browser, or in Safari while the installed app waited): refresh so
 *   the session carries the account (`is_anonymous: false`).
 */
async function checkRestoredSession(
  supabase: BrowserSupabaseClient,
  restored: User,
): Promise<CheckResult> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (isAuthRetryableFetchError(error)) return "unreachable";
    if (
      isAuthApiError(error) &&
      (error.status === 401 || error.status === 403)
    ) {
      await supabase.auth.signOut({ scope: "local" });
    }
    const { data: after } = await supabase.auth.getSession();
    return after.session ? "ok" : "restart";
  }
  if (restored.is_anonymous && data.user && !data.user.is_anonymous) {
    await supabase.auth.refreshSession();
  }
  return "ok";
}

function browserIsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function start(): () => void {
  let supabase: BrowserSupabaseClient;
  try {
    supabase = createClient();
  } catch (error) {
    console.error(error);
    setState({ status: "offline" });
    return () => {};
  }

  let disposed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  function schedule(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(() => void bootstrap(), delay);
  }

  /** One attempt: a session, and a server that answers. */
  async function connect(): Promise<CheckResult> {
    const result = await establishSession(supabase);
    if (disposed) return "ok";
    if (!result.user) return "unreachable";
    setState({
      user: result.user,
      status: browserIsOffline() ? "offline" : "ready",
    });
    if (!result.restored) return "ok";
    return checkRestoredSession(supabase, result.user);
  }

  async function bootstrap() {
    if (disposed || running) return;
    running = true;
    clearTimeout(timer);
    const result = await connect();
    running = false;
    if (disposed) return;

    if (result === "ok") {
      attempt = 0;
    } else if (result === "restart") {
      schedule(0);
    } else {
      setState({ status: "offline" });
      schedule(retryDelay(attempt++));
    }
  }

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (disposed || event === "INITIAL_SESSION") return;
    if (session) {
      setState({ user: session.user });
      // Auth just answered, or another tab changed the session: if this tab
      // is waiting to reconnect, check again now. Deferred because auth
      // callbacks must not call other auth methods synchronously.
      if (state.status === "offline" && !running) {
        attempt = 0;
        schedule(0);
      }
      return;
    }
    if (event === "SIGNED_OUT") {
      // Signed out here or the session was revoked: start over as a new
      // anonymous user so the app keeps working. Deferred because auth
      // callbacks must not call other auth methods synchronously.
      setState({ status: "loading", user: null });
      schedule(0);
    }
  });

  function handleOnline() {
    attempt = 0;
    void bootstrap();
  }

  function handleOffline() {
    setState({ status: "offline" });
  }

  // Waiting for the email link: it may be opened in another tab or browser,
  // and the conversion happens on the server. Coming back to this tab, a
  // refresh brings the updated user (is_anonymous false).
  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    if (state.user?.is_anonymous && state.user.new_email) {
      void supabase.auth.refreshSession();
    }
  }

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  retryNow = handleOnline;
  void bootstrap();

  return () => {
    disposed = true;
    clearTimeout(timer);
    data.subscription.unsubscribe();
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    retryNow = () => {};
  };
}

/**
 * Makes sure there is always a Supabase session: restores the stored one or
 * creates an anonymous user on first use, retrying with backoff while
 * offline. Mount it once, around the app.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => start(), []);
  return children;
}
