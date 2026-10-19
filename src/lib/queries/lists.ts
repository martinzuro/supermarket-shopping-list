"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { newId } from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { texts } from "@/lib/texts";
import { unwrap, writeSignal } from "./errors";
import { queryKeys } from "./keys";

export type List = Tables<"lists">;

async function fetchLists(): Promise<List[]> {
  return unwrap(
    await createClient()
      .from("lists")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  );
}

/** Lists the user is a member of (RLS does the filtering). */
export function useLists(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.lists(userId ?? ""),
    queryFn: fetchLists,
    enabled: userId !== null,
  });
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
  };
}

async function insertList(id: string, name: string): Promise<List> {
  // Through unwrap, so a lost answer (status 0) is retried like every write.
  return unwrap(
    await createClient()
      .from("lists")
      .insert({ id, name })
      .select()
      .abortSignal(writeSignal())
      .single(),
  );
}

function setLists(
  queryClient: QueryClient,
  userId: string,
  update: (lists: List[]) => List[],
) {
  queryClient.setQueryData<List[]>(queryKeys.lists(userId), (lists) =>
    update(lists ?? []),
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
      const previous = queryClient.getQueryData<List[]>(key);
      setLists(queryClient, userId, (lists) => [
        ...lists,
        optimisticList(id, userId),
      ]);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (created) => {
      setLists(queryClient, userId, (lists) =>
        lists.map((list) => (list.id === created.id ? created : list)),
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
 * First use (plan 3.3): a user with no list gets one. Returns the list to
 * show, `null` while it is not known yet.
 */
export function useCurrentList(userId: string | null) {
  const lists = useLists(userId);
  const createList = useCreateList(userId ?? "");
  const requested = useRef<string | null>(null);

  const list = lists.data?.[0] ?? null;
  const needsList =
    userId !== null && lists.isSuccess && lists.data.length === 0;

  useEffect(() => {
    // One creation per user, even across re-renders and query refetches.
    if (!needsList || requested.current === userId) return;
    requested.current = userId;
    createList.mutate({ id: newId() });
  }, [needsList, userId, createList]);

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
