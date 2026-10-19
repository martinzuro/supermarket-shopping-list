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

type Result = { data: unknown; error: unknown; status?: number };

/**
 * Minimal stand-in for a PostgREST query builder: every method chains and
 * the builder resolves to the result of `read` or, after `insert`, `write`,
 * after `update`, `update`, or after `delete`, `remove`. `read` and `remove`
 * get the filters too. The status defaults to 200, or 400 when the result
 * carries an error (a rejection, as PostgREST reports it).
 */
export function makeTable(handlers: {
  read: (filters: [string, unknown][]) => Promise<Result>;
  write: (row: unknown) => Promise<Result>;
  update?: (changes: unknown, filters: [string, unknown][]) => Promise<Result>;
  remove?: (filters: [string, unknown][]) => Promise<Result>;
}) {
  const insert = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
  function builder() {
    let payload: unknown;
    let operation: "read" | "insert" | "update" | "delete" = "read";
    const filters: [string, unknown][] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "is", "order", "single", "abortSignal"]) {
      chain[method] = vi.fn(() => chain);
    }
    for (const method of ["eq", "in", "is"]) {
      chain[method] = vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      });
    }
    chain.insert = vi.fn((row: unknown) => {
      payload = row;
      operation = "insert";
      insert(row);
      return chain;
    });
    chain.update = vi.fn((changes: unknown) => {
      payload = changes;
      operation = "update";
      return chain;
    });
    chain.delete = vi.fn(() => {
      operation = "delete";
      return chain;
    });
    chain.then = (
      onFulfilled: (value: Result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      if (operation === "update") update(payload, filters);
      if (operation === "delete") remove(filters);
      const result =
        operation === "insert"
          ? handlers.write(payload)
          : operation === "update"
            ? (handlers.update ?? handlers.write)(payload, filters)
            : operation === "delete"
              ? (handlers.remove ?? handlers.read)(filters)
              : handlers.read(filters);
      return result
        .then((value) => ({
          ...value,
          status: value.status ?? (value.error ? 400 : 200),
        }))
        .then(onFulfilled, onRejected);
    };
    return chain;
  }
  return { builder, insert, update, remove };
}

/**
 * Stand-in for `supabase.rpc`: chains `abortSignal` and `single` like the
 * PostgREST builder and resolves to the result of `handler`, with the same
 * status defaults as makeTable.
 */
export function makeRpc(
  handler: (name: string, args: unknown) => Promise<Result>,
) {
  return (name: string, args: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["abortSignal", "single"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (
      onFulfilled: (value: Result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      handler(name, args)
        .then((value) => ({
          ...value,
          status: value.status ?? (value.error ? 400 : 200),
        }))
        .then(onFulfilled, onRejected);
    return chain;
  };
}
