/**
 * A failed Supabase request, with the HTTP status PostgREST reported. The
 * status tells a rejection (4xx: RLS, a check constraint, a missing row) from
 * a request that never got an answer (0) or a server hiccup (5xx).
 */
export class RequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    error: { message: string; code?: string | null },
    status: number,
  ) {
    super(error.message);
    this.name = "RequestError";
    this.status = status;
    this.code = error.code ?? "";
  }
}

/** Throws the request's error, if any, and returns its data. */
export function unwrap<T>(result: {
  data: T | null;
  error: { message: string; code?: string | null } | null;
  status: number;
}): T {
  if (result.error) throw new RequestError(result.error, result.status);
  return result.data as T;
}

const MAX_MUTATION_RETRIES = 3;

/**
 * Mutations retry only when retrying can help: no answer (status 0) or a
 * server error. A rejection is final, so the optimistic change rolls back at
 * once instead of after the whole backoff.
 */
export function shouldRetryMutation(failureCount: number, error: unknown) {
  if (failureCount >= MAX_MUTATION_RETRIES) return false;
  // Every network failure comes back from postgrest-js as a RequestError
  // with status 0. Anything else is a bug in the write itself: retrying
  // would only delay the rollback.
  if (!(error instanceof RequestError)) return false;
  return error.status === 0 || error.status >= 500;
}

/**
 * A write that hangs (signal but no packets) would block the list's queue of
 * writes for minutes. After this long it is aborted, which postgrest-js
 * reports as status 0, so it is retried like any lost request.
 */
const WRITE_TIMEOUT_MS = 10_000;

/** AbortSignal.timeout is missing before Safari 16 and Chrome 103. */
export function writeSignal(): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(WRITE_TIMEOUT_MS);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  return controller.signal;
}

/** Postgres unique_violation: on an insert retry, the first attempt was saved. */
export const DUPLICATE_KEY = "23505";

/**
 * Stable keys the sharing RPCs raise (migrations initial_schema and sharing)
 * plus how a request can fail on the way, for the texts the user sees.
 */
export const SHARING_ERRORS = [
  "not_authenticated",
  "invite_not_found",
  "invite_already_used",
  "invite_expired",
  "list_not_found",
  "source_not_found",
  "list_shared",
] as const;

export type SharingError =
  (typeof SHARING_ERRORS)[number] | "network" | "unknown";

export function sharingErrorOf(error: unknown): SharingError {
  if (!(error instanceof RequestError)) return "unknown";
  const key = SHARING_ERRORS.find((known) => known === error.message);
  if (key) return key;
  if (error.status === 0 || error.status >= 500) return "network";
  // An RPC called without a session runs as `anon`, which may not execute
  // it: Postgres says "permission denied for function".
  if (error.code === "42501") return "not_authenticated";
  return "unknown";
}

/**
 * A write the server refused in a way that may mean the user is no longer in
 * the list: RLS rejected an insert (42501, 403), an update found no row to
 * change (PGRST116, from `.single()`), or move_category found no category
 * the caller can see. Either way the lists are read again, which tells (see
 * useCurrentList).
 */
export function isAccessRejection(error: unknown): boolean {
  if (!(error instanceof RequestError)) return false;
  return (
    error.code === "42501" ||
    error.code === "PGRST116" ||
    error.message === "category_not_found" ||
    error.status === 401 ||
    error.status === 403
  );
}
