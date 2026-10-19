"use client";

import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { shouldRetryMutation } from "./errors";

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
 */
function makeQueryClient() {
  return new QueryClient({
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
