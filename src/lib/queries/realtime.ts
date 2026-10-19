"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { motionTokens } from "@/lib/design/motion";
import { createClient } from "@/lib/supabase/client";
import {
  applyRemoteItem,
  readItemsAgain,
  type Item,
  type RemoteItemChange,
} from "./items";
import { queryKeys } from "./keys";

/**
 * Keeps the cache of the user's current list in step with what the other
 * members do (plan 2.3, phase 2b): one Realtime channel per list, with the
 * changes to its items and categories. Mount it once, on the list screen.
 */
export function useListRealtime(userId: string | null, listId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (userId === null || listId === null) return;
    return openListChannel(queryClient, userId, listId);
  }, [queryClient, userId, listId]);
}

/**
 * Delays before opening the channel again after the server closed it. A
 * channel that errors or times out is rejoined by the client library on its
 * own; one the server closes (an expired token, for instance) is not.
 */
const REOPEN_MS = [1_000, 2_000, 5_000, 10_000];

// supabase.channel() hands back the existing channel for a topic it already
// has, and a channel being removed stays there until the server acknowledges
// the leave: a remount (React Strict Mode, a quick list change and back)
// would get the one on its way out. Every opening gets its own topic.
let openings = 0;

function openListChannel(
  queryClient: QueryClient,
  userId: string,
  listId: string,
): () => void {
  const supabase = createClient();
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const filter = `list_id=eq.${listId}`;

  function handleItem(payload: RealtimePostgresChangesPayload<Item>) {
    let change: RemoteItemChange;
    if (payload.eventType === "DELETE") {
      if (!payload.old.id) return;
      change = { type: "DELETE", id: payload.old.id };
    } else {
      change = { type: payload.eventType, row: payload.new };
    }
    const pulses = applyRemoteItem(queryClient, userId, listId, change);
    if (pulses && change.type !== "DELETE") {
      pulse(pulsesOf(queryClient, userId, listId), change.row.id);
    }
  }

  /**
   * The channel joined, or joined again after a lost connection: whatever
   * changed while it was not listening came with no event. Read it again.
   */
  function recover() {
    readItemsAgain(queryClient, userId, listId);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.categories(userId, listId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalog(userId, listId),
    });
  }

  async function open() {
    // The join carries the token of the session as it is now: the user may
    // have just changed, and the token is what RLS checks every event with.
    // Its renewals reach the open channel through supabase-js.
    try {
      await supabase.realtime.setAuth();
    } catch {
      // The join goes with the last token known; a refused join is retried.
    }
    if (disposed) return;
    const current = supabase
      .channel(`list:${listId}:${++openings}`, {
        // SUBSCRIBED only once the changes are flowing, so the read in
        // recover() leaves no gap.
        config: { postgres_changes_options: { wait: true } },
      })
      .on<Item>(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter },
        handleItem,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter },
        () =>
          void queryClient.invalidateQueries({
            queryKey: queryKeys.categories(userId, listId),
          }),
      );
    channel = current;
    current.subscribe((status) => {
      if (disposed || channel !== current) return;
      if (status === "SUBSCRIBED") {
        failures = 0;
        recover();
      } else if (status === "CLOSED") {
        channel = null;
        void supabase.removeChannel(current);
        const delay = REOPEN_MS[Math.min(failures++, REOPEN_MS.length - 1)];
        timer = setTimeout(() => void open(), delay);
      }
    });
  }

  void open();
  return () => {
    disposed = true;
    clearTimeout(timer);
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}

/**
 * How long a row another member changed stays lit. It then fades out over
 * `duration-slow` (ListRow `highlighted`): about a second in all
 * (DESIGN_DIRECTION.md, section 8).
 */
const PULSE_MS = 1000 - motionTokens.duration.slow * 1000;

type Pulses = {
  ids: ReadonlySet<string>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  listeners: Set<() => void>;
};

const EMPTY: ReadonlySet<string> = new Set();

// Per query client, so every test and every server render starts clean.
const pulseStores = new WeakMap<QueryClient, Map<string, Pulses>>();

function pulsesOf(queryClient: QueryClient, userId: string, listId: string) {
  let lists = pulseStores.get(queryClient);
  if (!lists) {
    lists = new Map();
    pulseStores.set(queryClient, lists);
  }
  const key = `${userId}:${listId}`;
  let store = lists.get(key);
  if (!store) {
    store = { ids: EMPTY, timers: new Map(), listeners: new Set() };
    lists.set(key, store);
  }
  return store;
}

function pulse(store: Pulses, id: string) {
  const notify = () => store.listeners.forEach((listener) => listener());
  // A second change while the row is lit keeps it lit a while longer.
  clearTimeout(store.timers.get(id));
  if (!store.ids.has(id)) {
    store.ids = new Set(store.ids).add(id);
    notify();
  }
  store.timers.set(
    id,
    setTimeout(() => {
      store.timers.delete(id);
      const ids = new Set(store.ids);
      ids.delete(id);
      store.ids = ids;
      notify();
    }, PULSE_MS),
  );
}

/**
 * Ids of the rows another member just added, edited or checked, while their
 * pulse lasts. Never the user's own changes (see applyRemoteItem).
 */
export function useRemoteChanges(
  userId: string | null,
  listId: string | null,
): ReadonlySet<string> {
  const queryClient = useQueryClient();
  const store =
    userId === null || listId === null
      ? null
      : pulsesOf(queryClient, userId, listId);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!store) return () => {};
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
  return useSyncExternalStore(
    subscribe,
    () => store?.ids ?? EMPTY,
    () => EMPTY,
  );
}
