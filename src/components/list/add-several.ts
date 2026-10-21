"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { addItems, useAddItems, type NewItem } from "@/lib/queries";

/**
 * Adding several products at once, and the "Agregaste N · Deshacer" it leaves
 * in the add bar: "Lo de siempre" and a pasted list (the bar's own review
 * sheet, A-3 and F-2) and a past trip (the menu's, F-4, in
 * docs/improvements.md). One write (useAddItems); the notice is shown once
 * the sheet that asked for it is gone, so a screen reader hears it (while a
 * sheet closes, Radix hides the rest of the page). The bar reads it from
 * here: the menu has no other way to reach it, as with the copy of what is
 * pending (send-pending.tsx).
 */

/** What an add of several put on the list: its notice, and "Deshacer". */
export type SeveralAdded = {
  key: string;
  /** When it was sent: a rejection, sent with it, comes after it. */
  at: number;
  /** The items it added, in order. */
  ids: readonly string[];
};

type AddedStore = {
  shown: SeveralAdded | null;
  listeners: Set<() => void>;
};

// Per query client, as the copy's notice: every test starts clean.
const addedStores = new WeakMap<QueryClient, AddedStore>();

function addedStoreOf(queryClient: QueryClient) {
  let store = addedStores.get(queryClient);
  if (!store) {
    store = { shown: null, listeners: new Set() };
    addedStores.set(queryClient, store);
  }
  return store;
}

/**
 * The bar shows this add's notice, once the sheet it came from is gone. If
 * the server rejected the add, its rejection shows instead: sent with the
 * add, it is never older than this notice, and a tie goes to the rejection
 * (add-item-bar.tsx).
 */
export function showAdded(queryClient: QueryClient, added: SeveralAdded) {
  const store = addedStoreOf(queryClient);
  store.shown = added;
  store.listeners.forEach((listener) => listener());
}

/** The last add of several to show, for the add bar's notice. */
export function useAddedNotice(): SeveralAdded | null {
  const store = addedStoreOf(useQueryClient());
  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
  return useSyncExternalStore(
    subscribe,
    () => store.shown,
    () => null,
  );
}

/**
 * When the last add's notice was shown: a bar that mounts after it (back
 * from another page) finds old news.
 */
export function lastAddedAt(queryClient: QueryClient): number {
  return addedStoreOf(queryClient).shown?.at ?? 0;
}

/**
 * Adds several products in one write. Returns what to tell once the sheet is
 * gone (showAdded), or null when there was nothing to add.
 */
export function useAddSeveral(userId: string, listId: string) {
  const addMany = useAddItems(userId, listId);
  return (created: readonly NewItem[]): SeveralAdded | null => {
    if (created.length === 0) return null;
    const variables = addItems(created);
    // Before writing: if the server rejects, its notice (with the time it
    // was sent) is not older than this one, and replaces it.
    const added: SeveralAdded = {
      key: `several:${variables.ids[0]}`,
      at: Date.now(),
      ids: variables.ids,
    };
    addMany.mutate(variables);
    return added;
  };
}
