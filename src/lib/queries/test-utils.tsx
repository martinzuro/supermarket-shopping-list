import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";

/** A query client for tests: no retries, no background refetch. */
export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

type Result = { data: unknown; error: unknown };

/**
 * Minimal stand-in for a PostgREST query builder: every method chains and
 * the builder resolves to the result of `read` or, after `insert`, `write`.
 */
export function makeTable(handlers: {
  read: () => Promise<Result>;
  write: (row: unknown) => Promise<Result>;
}) {
  const insert = vi.fn();
  function builder() {
    let inserted: unknown;
    let hasInsert = false;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "is", "eq", "order", "single"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.insert = vi.fn((row: unknown) => {
      inserted = row;
      hasInsert = true;
      insert(row);
      return chain;
    });
    chain.then = (
      onFulfilled: (value: Result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      (hasInsert ? handlers.write(inserted) : handlers.read()).then(
        onFulfilled,
        onRejected,
      );
    return chain;
  }
  return { builder, insert };
}
