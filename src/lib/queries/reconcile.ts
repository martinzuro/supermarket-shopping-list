import type { QueryClient } from "@tanstack/react-query";

/**
 * What keeps a list's cache in step with Realtime without breaking the
 * optimistic pattern (plan 2.3), for every table the list's channel hears:
 * telling the echoes of the user's own writes apart, and reading a query
 * again once for a burst of events. Items and categories use them.
 */

type Versioned = { id: string; updated_at: string };

/**
 * The versions (id and updated_at) the user's own writes produced, as their
 * answers reported them, per list. Realtime echoes those same writes back
 * with the same updated_at: an event carrying one of them is an echo, never
 * another member's change, whatever the cache shows by then. Kept a minute,
 * far longer than an echo takes. Ids are UUIDs, so rows of different tables
 * never collide.
 */
const ownVersions = new WeakMap<QueryClient, Map<string, number>>();
const OWN_VERSION_MS = 60_000;

const versionOf = (listId: string, row: Versioned) =>
  `${listId}:${row.id}@${row.updated_at}`;

export function rememberOwn(
  queryClient: QueryClient,
  listId: string,
  rows: readonly (Versioned | null)[],
) {
  let versions = ownVersions.get(queryClient);
  if (!versions) {
    versions = new Map();
    ownVersions.set(queryClient, versions);
  }
  const now = Date.now();
  for (const [version, at] of versions) {
    if (now - at > OWN_VERSION_MS) versions.delete(version);
  }
  for (const row of rows) {
    if (row) versions.set(versionOf(listId, row), now);
  }
}

export function isOwnVersion(
  queryClient: QueryClient,
  listId: string,
  row: Versioned,
) {
  return ownVersions.get(queryClient)?.has(versionOf(listId, row)) === true;
}

/** How long a read waits for the rest of a burst of events. */
const READ_AGAIN_MS = 100;

// Queries with a read already scheduled, per query client.
const scheduledReads = new WeakMap<QueryClient, Set<string>>();

/**
 * The query has to be read again: something changed that the cache may not
 * show, or a read in flight may have been made before a change just
 * received. The writes to it are the mutations under its key.
 *
 * - A read in flight is cancelled: its answer could overwrite what the
 *   events applied meanwhile, which the cache keeps. While a write is
 *   pending that read can only be the one of settle, made after the last
 *   write reached the server, so cancelling it drops no optimistic change.
 * - One read follows a moment later, once for a whole burst of events (an
 *   emptied cart is one event per row, a moved category two).
 * - While a write is queued or running, that read waits: an earlier one
 *   would drop the optimistic changes still pending. It waits rather than
 *   leaving it to settle, because the read of settle may be the one just
 *   cancelled. Once no write is pending, it runs.
 */
export function readAgain(queryClient: QueryClient, key: readonly unknown[]) {
  const filters = { queryKey: key, exact: true };
  // The first load is let through, so the list shows without waiting; the
  // read below follows it.
  if (
    queryClient.getQueryData(key) !== undefined &&
    queryClient.isFetching(filters) > 0
  ) {
    void queryClient.cancelQueries(filters);
  }
  let scheduled = scheduledReads.get(queryClient);
  if (!scheduled) {
    scheduled = new Set();
    scheduledReads.set(queryClient, scheduled);
  }
  const hash = JSON.stringify(key);
  if (scheduled.has(hash)) return;
  scheduled.add(hash);
  const read = () => {
    if (queryClient.isMutating({ mutationKey: key }) > 0) {
      setTimeout(read, READ_AGAIN_MS);
      return;
    }
    scheduled.delete(hash);
    void fetchAgain(queryClient, key);
  };
  setTimeout(read, READ_AGAIN_MS);
}

function fetchAgain(queryClient: QueryClient, key: readonly unknown[]) {
  const filters = { queryKey: key, exact: true };
  // Invalidating starts a fetch in flight over only when the query has data:
  // the first load is waited for, then the query is read again.
  if (
    queryClient.getQueryData(key) === undefined &&
    queryClient.isFetching(filters) > 0
  ) {
    return queryClient
      .refetchQueries(filters, { cancelRefetch: false })
      .then(() => queryClient.invalidateQueries(filters));
  }
  return queryClient.invalidateQueries(filters);
}
