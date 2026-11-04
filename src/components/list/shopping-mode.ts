"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The shopping mode (docs/improvements.md, F-1): the screen in the
 * supermarket. It belongs to this device, not to the list: what the other
 * members see does not change (that would be F-5). The header shows the
 * progress, the add bar folds into a button with "Terminé", and the screen
 * stays on (use-wake-lock.ts). The three read it from here, without props:
 * they are siblings in the page.
 *
 * It survives a reload: the list being shopped and since when are kept in
 * localStorage. After SHOPPING_MAX_MS it was another trip (someone forgot to
 * leave it), and the list opens as usual.
 */

/** "Empezar a comprar", in the header: the focus lands there when it ends. */
export const SHOPPING_START_ID = "shopping-start";
/** "Terminé", in the add bar: the focus lands there when the cart refills. */
export const SHOPPING_FINISH_ID = "shopping-finish";

/** Where this device keeps the list it is shopping, and since when. */
export const SHOPPING_KEY = "lista:shopping";

/** Longer than any trip to the supermarket: after this, the mode is off. */
export const SHOPPING_MAX_MS = 6 * 60 * 60 * 1000;

type Stored = { listId: string; since: number };

type ShoppingStore = {
  /** The list being shopped, or null. Read from storage on first use. */
  listId: string | null;
  /** When it started: the trip ends after SHOPPING_MAX_MS. */
  since: number;
  loaded: boolean;
  /** What "Terminé" does: the list's (list-view.tsx), set while it shows. */
  finish: (() => void) | null;
  listeners: Set<() => void>;
};

// Per query client, as the other notices between siblings: every test
// starts clean (storage aside, which the tests clear).
const stores = new WeakMap<QueryClient, ShoppingStore>();

function storeOf(queryClient: QueryClient) {
  let store = stores.get(queryClient);
  if (!store) {
    store = {
      listId: null,
      since: 0,
      loaded: false,
      finish: null,
      listeners: new Set(),
    };
    stores.set(queryClient, store);
  }
  return store;
}

/** Within the trip: started, and not longer ago than any trip lasts. */
function current(since: number) {
  const age = Date.now() - since;
  return age >= 0 && age <= SHOPPING_MAX_MS;
}

/**
 * The trip kept in storage, if it is still this trip's; null if there is
 * none (or it holds anything else). "blocked" when storage cannot be read
 * at all (a browser that blocks site data): then only this page knows.
 */
function readStored(): Stored | null | "blocked" {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SHOPPING_KEY);
  } catch {
    return "blocked";
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Stored> | null;
    if (
      typeof value?.listId === "string" &&
      typeof value.since === "number" &&
      current(value.since)
    ) {
      return { listId: value.listId, since: value.since };
    }
  } catch {
    // Not ours to read: dropped below.
  }
  write(null);
  return null;
}

function write(value: Stored | null) {
  try {
    if (value) window.localStorage.setItem(SHOPPING_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(SHOPPING_KEY);
  } catch {
    // Without storage the mode still works, for this page only.
  }
}

function setShopping(store: ShoppingStore, trip: Stored | null) {
  store.loaded = true;
  store.since = trip?.since ?? 0;
  const listId = trip?.listId ?? null;
  if (store.listId === listId) return;
  store.listId = listId;
  store.listeners.forEach((listener) => listener());
}

/**
 * What storage says now. Without storage, the page's own trip stands until
 * it is over: a glance at another app must not end it.
 */
function sync(store: ShoppingStore) {
  const stored = readStored();
  if (stored !== "blocked") {
    setShopping(store, stored);
  } else if (store.listId !== null && !current(store.since)) {
    setShopping(store, null);
  }
}

/** Only in the browser: on the server (prerender) the mode is off. */
function snapshot(store: ShoppingStore) {
  if (!store.loaded) sync(store);
  return store.listId;
}

export type ShoppingMode = {
  /** This device is shopping the list on screen. */
  on: boolean;
  start: () => void;
  stop: () => void;
};

/**
 * Whether this device is shopping `listId`. While the list is not known yet
 * (a reload), a kept mode counts: the screen does not flash the usual list
 * before it. A mode kept for another list (the user left it) does not.
 */
export function useShoppingMode(listId: string | null): ShoppingMode {
  const store = storeOf(useQueryClient());
  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      // Another tab started or ended it, or the page comes back after hours
      // (the trip may be long over): read storage again.
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === SHOPPING_KEY) sync(store);
      };
      const onVisible = () => {
        if (document.visibilityState === "visible") sync(store);
      };
      window.addEventListener("storage", onStorage);
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        store.listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
    [store],
  );
  const shopping = useSyncExternalStore(
    subscribe,
    () => snapshot(store),
    () => null,
  );
  const on = shopping !== null && (listId === null || shopping === listId);
  const start = useCallback(() => {
    if (listId === null) return;
    const trip = { listId, since: Date.now() };
    write(trip);
    setShopping(store, trip);
  }, [store, listId]);
  const stop = useCallback(() => {
    write(null);
    setShopping(store, null);
  }, [store]);
  return { on, start, stop };
}

/**
 * The list registers what "Terminé" does: empty the cart with its moment
 * (M-3) and leave the mode. The handler is read when the button is tapped,
 * so it always sees the list as it is then.
 */
export function useShoppingFinish(handler: () => void) {
  const queryClient = useQueryClient();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(
    () => registerFinish(queryClient, () => latest.current()),
    [queryClient],
  );
}

/** Sets what "Terminé" does; returns how to unset it. */
function registerFinish(queryClient: QueryClient, run: () => void) {
  const store = storeOf(queryClient);
  store.finish = run;
  return () => {
    if (store.finish === run) store.finish = null;
  };
}

/**
 * "Terminé", from the add bar. Without a list to empty (it is not on
 * screen), it only leaves the mode.
 */
export function useFinishShopping() {
  const store = storeOf(useQueryClient());
  return useCallback(() => {
    if (store.finish) {
      store.finish();
    } else {
      write(null);
      setShopping(store, null);
    }
  }, [store]);
}
