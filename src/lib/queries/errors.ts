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
