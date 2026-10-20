"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { motionTokens } from "@/lib/design/motion";
import { createClient } from "@/lib/supabase/client";
import { texts } from "@/lib/texts";
import {
  applyRemoteCategory,
  type Category,
  type RemoteCategoryChange,
} from "./categories";
import {
  applyRemoteItem,
  readItemsAgain,
  type Item,
  type RemoteItemChange,
  type RemoteItemOutcome,
} from "./items";
import { queryKeys } from "./keys";
import { dropList } from "./lists";
import { noteMemberGone, type Member } from "./members";
import { readAgain } from "./reconcile";

/**
 * Keeps the cache of the user's current list in step with what the other
 * members do (plan 2.3, phases 2b and 2c): one Realtime channel per list,
 * with the changes to its items, categories and members. Mount it once, on
 * the list screen.
 *
 * Membership (phase 2c): someone joining or leaving updates the members and
 * the lists. The user's own row going away means they lost the list (an
 * owner took them out, or they left from another device): the channel
 * closes at once and the list leaves the cache, and useCurrentList tells
 * them. Realtime checks RLS for inserts and updates but not for deletes,
 * which is what lets that event reach someone no longer in the list, and
 * also why the channel cannot stay open: it would keep hearing the ids of
 * items deleted for good.
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
  // The user is out of the list: whatever still comes is not for them.
  let lost = false;
  const filter = `list_id=eq.${listId}`;

  function handleItem(payload: RealtimePostgresChangesPayload<Item>) {
    if (lost) return;
    let change: RemoteItemChange;
    if (payload.eventType === "DELETE") {
      if (!payload.old.id) return;
      change = { type: "DELETE", id: payload.old.id };
    } else {
      change = {
        type: payload.eventType,
        row: payload.new,
        previous: payload.eventType === "UPDATE" ? payload.old : undefined,
      };
    }
    const told = applyRemoteItem(queryClient, userId, listId, change);
    if (!told) return;
    // A row that left the list has nothing to light up.
    if (told.kind !== "removed") {
      pulse(pulsesOf(queryClient, userId, listId), told.id);
    }
    announce(announcementsOf(queryClient, userId, listId), told);
  }

  function handleCategory(payload: RealtimePostgresChangesPayload<Category>) {
    if (lost) return;
    let change: RemoteCategoryChange;
    if (payload.eventType === "DELETE") {
      if (!payload.old.id) {
        readAgain(queryClient, queryKeys.categories(userId, listId));
        return;
      }
      change = { type: "DELETE", id: payload.old.id };
    } else {
      change = {
        type: payload.eventType,
        row: payload.new,
        previous: payload.eventType === "UPDATE" ? payload.old : undefined,
      };
    }
    if (applyRemoteCategory(queryClient, userId, listId, change)) {
      announceReorder(announcementsOf(queryClient, userId, listId));
    }
  }

  function handleMember(
    payload: RealtimePostgresChangesPayload<{ user_id: string }>,
  ) {
    if (lost) return;
    if (payload.eventType === "DELETE") {
      const gone = payload.old.user_id;
      if (gone === userId) {
        lose();
        return;
      }
      if (gone) {
        noteMemberGone(queryClient, listId, gone);
        queryClient.setQueryData<Member[]>(
          queryKeys.members(userId, listId),
          (members) => members?.filter((member) => member.user_id !== gone),
        );
      }
    }
    // A newcomer's email comes with the members' read, and the count of
    // members with the lists'.
    void queryClient.invalidateQueries({
      queryKey: queryKeys.members(userId, listId),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) });
  }

  /** Out of the list: stop listening now, before React moves on. */
  function lose() {
    lost = true;
    clearTimeout(timer);
    const current = channel;
    channel = null;
    if (current) void supabase.removeChannel(current);
    silence(announcementsOf(queryClient, userId, listId));
    dropList(queryClient, userId, listId);
  }

  /**
   * The channel joined, or joined again after a lost connection: whatever
   * changed while it was not listening came with no event. Read it again,
   * the user's lists too: if they were taken out of this one meanwhile, that
   * is how the app finds out (useCurrentList).
   */
  function recover() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.members(userId, listId),
    });
    readItemsAgain(queryClient, userId, listId);
    readAgain(queryClient, queryKeys.categories(userId, listId));
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
    if (disposed || lost) return;
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
      .on<Category>(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter },
        handleCategory,
      )
      .on<{ user_id: string }>(
        "postgres_changes",
        { event: "*", schema: "public", table: "list_members", filter },
        handleMember,
      );
    channel = current;
    current.subscribe((status) => {
      if (disposed || lost || channel !== current) return;
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
    silence(announcementsOf(queryClient, userId, listId));
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

/** How long an announcement waits for the rest of a burst of changes. */
const ANNOUNCE_AFTER_MS = 700;
/** How long it stays in the live region, where a screen reader can find it. */
const ANNOUNCE_FOR_MS = 5_000;

/**
 * The text for the live region, and a number that changes with every
 * announcement: a region whose content is replaced is read again even when
 * the text is the same as last time.
 */
export type Announcement = { text: string; seq: number };

type Kind = RemoteItemOutcome["kind"];

type Announcements = {
  /** Per row in the burst: its latest name and everything done to it. */
  burst: Map<string, { name: string; kinds: Kind[] }>;
  /** Whether another member moved a category during the burst. */
  reordered: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  clear: ReturnType<typeof setTimeout> | undefined;
  current: Announcement;
  listeners: Set<() => void>;
};

const SILENT: Announcement = { text: "", seq: 0 };

const announcementStores = new WeakMap<
  QueryClient,
  Map<string, Announcements>
>();

function announcementsOf(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  let lists = announcementStores.get(queryClient);
  if (!lists) {
    lists = new Map();
    announcementStores.set(queryClient, lists);
  }
  const key = `${userId}:${listId}`;
  let store = lists.get(key);
  if (!store) {
    store = {
      burst: new Map(),
      reordered: false,
      timer: undefined,
      clear: undefined,
      current: SILENT,
      listeners: new Set(),
    };
    lists.set(key, store);
  }
  return store;
}

/**
 * What a burst did to one row, all told: added (and still there), removed,
 * moved to or out of the cart (a check undone within the burst is nothing),
 * or edited. Null when it ends as it started, as far as the user can tell.
 */
export function netKind(kinds: readonly Kind[]): Kind | null {
  const last = kinds.at(-1);
  if (kinds[0] === "removed") return last === "removed" ? "removed" : null;
  if (kinds.includes("added")) return last === "removed" ? null : "added";
  if (last === "removed") return "removed";
  const toggles = kinds.filter(
    (kind) => kind === "checked" || kind === "unchecked",
  );
  const net = toggles.reduce(
    (sum, kind) => sum + (kind === "checked" ? 1 : -1),
    0,
  );
  if (net !== 0) return toggles.at(-1)!;
  return kinds.includes("edited") ? "edited" : null;
}

/** Collects another member's change into the burst being told. */
function announce(store: Announcements, told: RemoteItemOutcome) {
  const row = store.burst.get(told.id);
  store.burst.set(told.id, {
    name: told.name,
    kinds: [...(row?.kinds ?? []), told.kind],
  });
  tellBurst(store);
}

/** Another member moved a category: told once per burst, after the items. */
function announceReorder(store: Announcements) {
  store.reordered = true;
  tellBurst(store);
}

function tellBurst(store: Announcements) {
  if (store.timer) return;
  store.timer = setTimeout(() => {
    store.timer = undefined;
    const changes: RemoteItemOutcome[] = [];
    for (const [id, { name, kinds }] of store.burst) {
      const kind = netKind(kinds);
      if (kind) changes.push({ kind, id, name });
    }
    store.burst.clear();
    const reordered = store.reordered;
    store.reordered = false;
    const text = [
      describeRemoteChanges(changes),
      reordered ? texts.remoteChanges.reordered : "",
    ]
      .filter(Boolean)
      .join(". ");
    if (!text) return;
    store.current = { text, seq: store.current.seq + 1 };
    notify(store);
    clearTimeout(store.clear);
    store.clear = setTimeout(() => {
      store.current = { text: "", seq: store.current.seq };
      notify(store);
    }, ANNOUNCE_FOR_MS);
  }, ANNOUNCE_AFTER_MS);
}

function notify(store: Announcements) {
  store.listeners.forEach((listener) => listener());
}

/**
 * The channel closed (another list, another user, the screen gone): what
 * was about to be said, or still sits in the region, no longer applies.
 */
function silence(store: Announcements) {
  clearTimeout(store.timer);
  clearTimeout(store.clear);
  store.timer = undefined;
  store.clear = undefined;
  store.burst.clear();
  store.reordered = false;
  if (store.current.text) {
    store.current = { text: "", seq: store.current.seq };
    notify(store);
  }
}

/**
 * One sentence for a burst of other members' changes: the row by name when
 * there is one, a count when they are all of a kind, the number of rows
 * changed otherwise. Empty when there is nothing to tell.
 */
export function describeRemoteChanges(
  changes: readonly RemoteItemOutcome[],
): string {
  const [first] = changes;
  if (!first) return "";
  if (changes.length === 1)
    return texts.remoteChanges.one[first.kind](first.name);
  return changes.every((change) => change.kind === first.kind)
    ? texts.remoteChanges.many[first.kind](changes.length)
    : texts.remoteChanges.mixed(changes.length);
}

/**
 * What screen readers are told about the rows other members just changed
 * (the pulse alone is colour). For one polite live region on the list
 * screen. Never the user's own changes (see applyRemoteItem).
 */
export function useRemoteAnnouncement(
  userId: string | null,
  listId: string | null,
): Announcement {
  const queryClient = useQueryClient();
  const store =
    userId === null || listId === null
      ? null
      : announcementsOf(queryClient, userId, listId);
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
    () => store?.current ?? SILENT,
    () => SILENT,
  );
}
