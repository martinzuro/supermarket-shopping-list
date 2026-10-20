"use client";

import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type Mutation,
  type MutationKey,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { compareTimestamps, newId } from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { texts } from "@/lib/texts";
import {
  DUPLICATE_KEY,
  isAccessRejection,
  RequestError,
  unwrap,
  writeSignal,
} from "./errors";
import { queryKeys } from "./keys";

/** A list the user is in, with what their membership says about it. */
export type List = Tables<"lists"> & {
  role: "owner" | "member";
  /** When the user joined it (for its owner, when it was created). */
  joined_at: string;
  /** People in the list, the user included. */
  member_count: number;
};

type MembershipRow = {
  role: string;
  joined_at: string;
  list: Tables<"lists"> & { members: { count: number }[] };
};

function toList({ role, joined_at, list }: MembershipRow): List {
  const { members, ...row } = list;
  return {
    ...row,
    role: role === "owner" ? "owner" : "member",
    joined_at,
    member_count: members[0]?.count ?? 1,
  };
}

async function fetchLists(userId: string): Promise<List[]> {
  // Through the user's own memberships (RLS would also show the other
  // members' rows of a shared list), with the list not soft-deleted.
  const rows = unwrap(
    await createClient()
      .from("list_members")
      .select(
        "role, joined_at, list:lists!inner(*, members:list_members(count))",
      )
      .eq("user_id", userId)
      .is("list.deleted_at", null)
      .order("joined_at", { ascending: true })
      .order("list_id", { ascending: true }),
  ) as unknown as MembershipRow[];
  return rows.map(toList);
}

/** Lists the user is a member of, oldest membership first. */
export function useLists(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.lists(userId ?? ""),
    queryFn: () => fetchLists(userId!),
    enabled: userId !== null,
  });
}

/**
 * The list the app shows (v1 shows one, docs/roadmap.md): the one the user
 * joined last. Accepting an invite makes the shared list the current one;
 * the user's own list stays behind until it is merged or discarded
 * (leftoversOf).
 */
export function currentListOf(lists: readonly List[] | undefined): List | null {
  if (!lists || lists.length === 0) return null;
  return lists.reduce((latest, list) => {
    const order = compareTimestamps(list.joined_at, latest.joined_at);
    return order > 0 || (order === 0 && list.id > latest.id) ? list : latest;
  });
}

/**
 * The other lists the user is in, which the app offers to merge into the
 * current one or discard: lists of their own nobody else is in, and lists of
 * others they are a plain member of. A list of their own that others still
 * use is not one: it stays for them (a known limitation of v1).
 */
export function leftoversOf(
  lists: readonly List[] | undefined,
  current: List | null,
): List[] {
  if (!lists || !current) return [];
  return lists.filter(
    (list) =>
      list.id !== current.id &&
      (list.role === "member" || list.member_count <= 1),
  );
}

/**
 * A list of the user's own that other people are in: joining another list
 * would leave it behind, unseen and out of reach of any new invitation (v1
 * shows one list), so the invite screen warns first. Not a leftover: it
 * cannot be merged or discarded without taking the others out of it.
 */
export function isSharedOwnList(list: List | null): list is List {
  return list !== null && list.role === "owner" && list.member_count > 1;
}

function optimisticList(id: string, userId: string): List {
  const now = new Date().toISOString();
  return {
    id,
    name: texts.list.defaultName,
    created_by: userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    role: "owner",
    joined_at: now,
    member_count: 1,
  };
}

async function insertList(id: string, name: string): Promise<Tables<"lists">> {
  // Through unwrap, so a lost answer (status 0) is retried like every write.
  try {
    return unwrap(
      await createClient()
        .from("lists")
        .insert({ id, name })
        .select()
        .abortSignal(writeSignal())
        .single(),
    );
  } catch (error) {
    // A retry after a lost answer: the first attempt was saved (the id is
    // generated on the client). Read it, so onSuccess runs and resets the
    // list's queries as for any creation.
    if (error instanceof RequestError && error.code === DUPLICATE_KEY) {
      return unwrap(
        await createClient()
          .from("lists")
          .select("*")
          .eq("id", id)
          .abortSignal(writeSignal())
          .single(),
      );
    }
    throw error;
  }
}

export function setLists(
  queryClient: QueryClient,
  userId: string,
  update: (lists: List[]) => List[],
) {
  queryClient.setQueryData<List[]>(queryKeys.lists(userId), (lists) =>
    update(lists ?? []),
  );
}

/**
 * Takes a list out of the user's lists in the cache, for an optimistic
 * leave, discard or merge. Returns what a rollback needs to put it back.
 */
export function takeListOut(
  queryClient: QueryClient,
  userId: string,
  listId: string,
): { list: List; index: number } | null {
  const lists = queryClient.getQueryData<List[]>(queryKeys.lists(userId));
  const index = lists?.findIndex((list) => list.id === listId) ?? -1;
  if (!lists || index === -1) return null;
  setLists(queryClient, userId, (current) =>
    current.filter((list) => list.id !== listId),
  );
  return { list: lists[index], index };
}

/** Rollback of takeListOut: back in its place, unless it is back already. */
export function putListBack(
  queryClient: QueryClient,
  userId: string,
  taken: { list: List; index: number } | null | undefined,
) {
  if (!taken) return;
  setLists(queryClient, userId, (lists) =>
    lists.some((list) => list.id === taken.list.id)
      ? lists
      : [
          ...lists.slice(0, taken.index),
          taken.list,
          ...lists.slice(taken.index),
        ],
  );
}

/**
 * Creates the user's list with an optimistic update: the list appears at
 * once with a client-generated id (the owner membership and the default
 * categories are created by a database trigger).
 */
export function useCreateList(userId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.lists(userId);
  return useMutation({
    mutationKey: [...key, "create"],
    mutationFn: ({ id }: { id: string }) =>
      insertList(id, texts.list.defaultName),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: key });
      setLists(queryClient, userId, (lists) => [
        ...lists,
        optimisticList(id, userId),
      ]);
    },
    onError: (_error, { id }) => {
      // Only this list: a read that landed meanwhile stays (plan 2.3).
      setLists(queryClient, userId, (lists) =>
        lists.filter((list) => list.id !== id),
      );
    },
    onSuccess: (created) => {
      setLists(queryClient, userId, (lists) =>
        lists.map((list) =>
          list.id === created.id ? { ...list, ...created } : list,
        ),
      );
      // While the insert was in flight the optimistic list already fetched
      // its items, categories and catalog, and the server (no list yet, RLS)
      // answered with nothing. Now the trigger has seeded its categories:
      // start those queries over, so nothing reads the empty answers.
      return queryClient.resetQueries({
        queryKey: queryKeys.list(userId, created.id),
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Mutation keys of the writes that take the user out of a list (members.ts).
 * Not under the lists key: the list screen reads any mutation there as the
 * first list being created.
 */
export const membershipMutationKeys = {
  all: (userId: string) => ["user", userId, "membership"] as const,
  leave: (userId: string, listId: string) =>
    ["user", userId, "membership", "leave", listId] as const,
  discard: (userId: string, listId: string) =>
    ["user", userId, "membership", "discard", listId] as const,
};

/**
 * Whether a mutation takes a list out of the user's lists: leaving or
 * discarding one (membershipMutationKeys), or merging one away (merge.ts,
 * whose variables name the source). While one is pending the cache may show
 * no list for a moment, and its rollback may bring one back.
 */
export function takesListOut(mutation: Mutation, userId: string) {
  const [scope, owner, kind] = mutation.options.mutationKey ?? [];
  if (scope !== "user" || owner !== userId) return false;
  const variables = mutation.state.variables as
    { sourceListId?: string } | undefined;
  return kind === "membership" || variables?.sourceListId !== undefined;
}

/** The user is leaving the list (useLeaveList), right now. */
function isLeaving(queryClient: QueryClient, userId: string, listId: string) {
  return (
    queryClient.getMutationCache().findAll({
      mutationKey: membershipMutationKeys.leave(userId, listId),
      status: "pending",
    }).length > 0
  );
}

/**
 * A creation of the list the server has not confirmed (in flight, or
 * rolled back after an error): it was never more than optimistic.
 */
function isUnconfirmed(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  return (
    queryClient.getMutationCache().findAll({
      mutationKey: [...queryKeys.lists(userId), "create"],
      predicate: (mutation) =>
        (mutation.state.variables as { id?: string } | undefined)?.id ===
          listId && mutation.state.status !== "success",
    }).length > 0
  );
}

/**
 * What the app tells the user when the list they were seeing goes away:
 * they left it, someone took them out (or it is gone), or leaving failed and
 * the list is back. For one notice on the list screen.
 */
export type MembershipNotice = {
  kind: "left" | "removed" | "leave_failed";
  listId: string;
  /** Changes with every notice, so the same one can be told twice. */
  seq: number;
};

type NoticeStore = {
  current: MembershipNotice | null;
  seq: number;
  /** When the focus was asked to go to the notice (see requestNoticeFocus). */
  focusAt: number | null;
  listeners: Set<() => void>;
};

/** A focus request that waits longer than this for its notice is stale. */
const NOTICE_FOCUS_MS = 15_000;

// Per query client, so every test and every server render starts clean.
const noticeStores = new WeakMap<QueryClient, NoticeStore>();

function noticeStoreOf(queryClient: QueryClient) {
  let store = noticeStores.get(queryClient);
  if (!store) {
    store = { current: null, seq: 0, focusAt: null, listeners: new Set() };
    noticeStores.set(queryClient, store);
  }
  return store;
}

export function setMembershipNotice(
  queryClient: QueryClient,
  notice: Omit<MembershipNotice, "seq"> | null,
) {
  const store = noticeStoreOf(queryClient);
  store.current = notice ? { ...notice, seq: ++store.seq } : null;
  store.listeners.forEach((listener) => listener());
}

/**
 * Asks for the focus to go to the notice, as soon as there is one: the
 * place the user was in (the sheet they left the list from) is gone, and
 * the notice is what changed. A request that finds no notice within
 * NOTICE_FOCUS_MS lapses, so a later notice never takes the focus from
 * where the user went meanwhile.
 */
export function requestNoticeFocus(queryClient: QueryClient) {
  const store = noticeStoreOf(queryClient);
  store.focusAt = Date.now();
  store.listeners.forEach((listener) => listener());
}

function takeNoticeFocus(queryClient: QueryClient) {
  const store = noticeStoreOf(queryClient);
  const at = store.focusAt;
  if (at === null) return false;
  store.focusAt = null;
  store.listeners.forEach((listener) => listener());
  return Date.now() - at < NOTICE_FOCUS_MS;
}

/** The membership notice to show, if any, and how to dismiss it. */
export function useMembershipNotice() {
  const queryClient = useQueryClient();
  const store = noticeStoreOf(queryClient);
  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
  const notice = useSyncExternalStore(
    subscribe,
    () => store.current,
    () => null,
  );
  const focusRequested =
    useSyncExternalStore(
      subscribe,
      () => store.focusAt,
      () => null,
    ) !== null;
  const dismiss = useCallback(
    () => setMembershipNotice(queryClient, null),
    [queryClient],
  );
  /** True once, if the focus was asked for and the request is not stale. */
  const takeFocusRequest = useCallback(
    () => takeNoticeFocus(queryClient),
    [queryClient],
  );
  return { notice, dismiss, focusRequested, takeFocusRequest };
}

/**
 * The list the user was seeing is no longer among their lists: tell why,
 * unless they retired it themselves, and forget what the cache held of it.
 * The list's queries are no longer observed by now (the screen moved on).
 */
function listWentAway(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  if (!isUnconfirmed(queryClient, userId, listId)) {
    setMembershipNotice(queryClient, {
      kind: isLeaving(queryClient, userId, listId) ? "left" : "removed",
      listId,
    });
  }
  const filters = { queryKey: queryKeys.list(userId, listId) };
  void queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
}

/**
 * The user lost a list while it was on screen (the Realtime event of their
 * own membership going away): out of the cache now, without waiting for a
 * read. useCurrentList then tells them and moves on.
 */
export function dropList(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  void queryClient.cancelQueries({ queryKey: queryKeys.list(userId, listId) });
  setLists(queryClient, userId, (lists) =>
    lists.filter((list) => list.id !== listId),
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) });
}

/**
 * A write was refused in a way that may mean the user lost the list
 * (isAccessRejection): read the lists again, so useCurrentList finds out.
 * Wired to every mutation in query-client.tsx; mutation keys start with
 * ["user", userId].
 */
export function readListsAfterRejection(
  queryClient: QueryClient,
  mutationKey: MutationKey | undefined,
  error: unknown,
) {
  const [scope, userId] = mutationKey ?? [];
  if (scope !== "user" || typeof userId !== "string") return;
  if (!isAccessRejection(error)) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) });
}

const LAST_LIST_KEY = "lista:last-list:";

/**
 * The list last shown to this user on this device, so a list lost while the
 * app was closed is told on the next open too. Storage may be unavailable.
 */
function readLastList(userId: string): string | null {
  try {
    return window.localStorage.getItem(LAST_LIST_KEY + userId);
  } catch {
    return null;
  }
}

function writeLastList(userId: string, listId: string | null) {
  try {
    if (listId) window.localStorage.setItem(LAST_LIST_KEY + userId, listId);
    else window.localStorage.removeItem(LAST_LIST_KEY + userId);
  } catch {
    // A per-device convenience: without it, only the live loss is told.
  }
}

/**
 * The list to show (currentListOf), creating one when the user has none:
 * on first use (plan 3.3) and after losing their only list. Returns `null`
 * while it is not known yet.
 *
 * It also notices when the list on screen goes away (left, removed, or lost
 * while the app was closed): see listWentAway.
 */
export function useCurrentList(userId: string | null) {
  const queryClient = useQueryClient();
  const lists = useLists(userId);
  const createList = useCreateList(userId ?? "");
  // While a list is being taken out, the cache may show none for a moment;
  // a rollback brings it back, and a new list would be in the way.
  const retiring =
    useIsMutating({
      predicate: (mutation) => takesListOut(mutation, userId ?? ""),
    }) > 0;
  // The creation asked for, and for whom: no second one for that user, even
  // across re-renders, refetches and failures (retry() asks again), until
  // another list shows up. Only then can the user end up with none again
  // (they lost a shared list, after merging or discarding their own one).
  const requested = useRef<{ userId: string; listId: string } | null>(null);
  const shown = useRef<{ userId: string; listId: string | null } | null>(null);

  const list = currentListOf(lists.data);
  const listId = list?.id ?? null;
  const needsList =
    userId !== null && lists.isSuccess && lists.data.length === 0 && !retiring;

  useEffect(() => {
    const asked = requested.current;
    if (asked && lists.data?.some((each) => each.id !== asked.listId)) {
      requested.current = null;
    }
  }, [lists.data]);

  useEffect(() => {
    if (!needsList || requested.current?.userId === userId) return;
    const id = newId();
    requested.current = { userId, listId: id };
    createList.mutate({ id });
  }, [needsList, userId, createList]);

  useEffect(() => {
    if (userId === null || !lists.isSuccess) return;
    const before =
      shown.current?.userId === userId
        ? shown.current.listId
        : readLastList(userId);
    if (before && !lists.data.some((each) => each.id === before)) {
      listWentAway(queryClient, userId, before);
    }
    shown.current = { userId, listId };
    // Only a list the server has: a creation that never lands must not be
    // told as lost on the next open.
    if (listId === null || !isUnconfirmed(queryClient, userId, listId)) {
      writeLastList(userId, listId);
    }
  }, [queryClient, userId, lists.isSuccess, lists.data, listId]);

  /** After an error: read the lists again and, if still none, create one. */
  function retry() {
    requested.current = null;
    createList.reset();
    return lists.refetch();
  }

  return {
    list,
    isPending: lists.isPending || (needsList && createList.isPending),
    error: lists.error ?? createList.error,
    /** A retry is running: the lists are loading again or the list is being created. */
    isRetrying: lists.isFetching || createList.isPending,
    retry,
  };
}
