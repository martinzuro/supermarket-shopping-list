"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { shouldRetryMutation } from "./errors";
import { readListsAfterRejection } from "./lists";

/**
 * Single server-state layer of the app (plan 2.6): every read goes through
 * TanStack Query, every write is a mutation with an optimistic update.
 *
 * - `networkMode: "online"` (the default) pauses queries and mutations while
 *   the browser is offline and resumes them when the network is back, which
 *   is the "retry on its own while the tab stays open" behaviour of ADR 0003.
 * - Mutations retry a few times with backoff so a flaky connection does not
 *   drop a write the user already saw applied. A rejection from the server is
 *   not retried: the optimistic change rolls back at once.
 * - A write refused in a way that may mean the user is no longer in the list
 *   reads the lists again (readListsAfterRejection): losing a list while
 *   offline shows up at the first write too, not only when Realtime is back.
 */
function makeQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        readListsAfterRejection(
          queryClient,
          mutation.options.mutationKey,
          error,
        ),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 2,
      },
      mutations: {
        retry: shouldRetryMutation,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
    },
  });
  return queryClient;
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // One client per server render, one shared client in the browser.
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}
