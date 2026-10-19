import { act, renderHook, waitFor } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCatalog, useCategories } from "./categories";
import {
  newItem,
  useAddItem,
  useEditItem,
  useEmptyCart,
  useItems,
  useToggleItem,
  type Item,
} from "./items";
import { queryKeys } from "./keys";
import {
  describeRemoteChanges,
  useListRealtime,
  useRemoteAnnouncement,
  useRemoteChanges,
} from "./realtime";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";
const MEMBER = "00000000-0000-7000-8000-000000000003";
const OTHER_LIST = "00000000-0000-7000-8000-000000000004";

type Result = { data: unknown; error: unknown; status?: number };

const readItems = vi.fn<() => Promise<Result>>();
const writeItems = vi.fn<(row: unknown) => Promise<Result>>();
const updateItems =
  vi.fn<(changes: unknown, filters: [string, unknown][]) => Promise<Result>>();
const readCategories = vi.fn<() => Promise<Result>>();
const readCatalog = vi.fn<() => Promise<Result>>();
const readOnly = () => Promise.reject(new Error("read-only table"));
const tables = {
  items: makeTable({ read: readItems, write: writeItems, update: updateItems }),
  categories: makeTable({ read: readCategories, write: readOnly }),
  catalog: makeTable({ read: readCatalog, write: readOnly }),
};

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
type Binding = {
  event: string;
  schema: string;
  table: string;
  filter: string;
  handler: (payload: unknown) => void;
};

/** Stand-in for a Realtime channel: each test plays the server by hand. */
class FakeChannel {
  readonly bindings: Binding[] = [];
  removed = false;
  private onStatus: ((status: Status) => void) | undefined;

  constructor(
    readonly topic: string,
    readonly params: unknown,
  ) {}

  on(
    _type: string,
    filter: Omit<Binding, "handler">,
    handler: Binding["handler"],
  ) {
    this.bindings.push({ ...filter, handler });
    return this;
  }

  subscribe(callback: (status: Status) => void) {
    calls.push("subscribe");
    this.onStatus = callback;
    return this;
  }

  /** The library reports a change of the channel's state. */
  status(status: Status) {
    act(() => this.onStatus?.(status));
  }

  /** The server sends a change of a table. */
  emit(table: string, payload: unknown) {
    act(() => {
      for (const binding of this.bindings) {
        if (binding.table === table) binding.handler(payload);
      }
    });
  }

  /** What removeChannel does: leave, then report the channel closed. */
  close() {
    this.removed = true;
    this.onStatus?.("CLOSED");
  }
}

const calls: string[] = [];
const opened: FakeChannel[] = [];
const live = () => opened.filter((channel) => !channel.removed);

const supabase = {
  from: (table: keyof typeof tables) => tables[table].builder(),
  channel: (topic: string, params: unknown) => {
    const channel = new FakeChannel(topic, params);
    opened.push(channel);
    return channel;
  },
  removeChannel: async (channel: FakeChannel) => {
    channel.close();
    return "ok";
  },
  realtime: {
    setAuth: async () => {
      calls.push("setAuth");
    },
  },
};

vi.mock("@/lib/supabase/client", () => ({ createClient: () => supabase }));

/** Timestamps as Postgres writes them, `n` microseconds apart. */
const at = (n: number) =>
  `2026-10-19T10:00:00.${String(n).padStart(6, "0")}+00:00`;

function serverRow(partial: Partial<Item> & Pick<Item, "id" | "name">): Item {
  return {
    list_id: LIST,
    name_normalized: partial.name.toLowerCase(),
    quantity: null,
    unit: null,
    note: null,
    category_id: null,
    estimated_price: null,
    currency: "UYU",
    checked: false,
    checked_at: null,
    position: 0,
    created_by: USER,
    created_at: at(0),
    updated_at: at(1),
    deleted_at: null,
    ...partial,
  };
}

const inserted = (row: Item) => ({ eventType: "INSERT", new: row, old: {} });
const updated = (row: Item) => ({ eventType: "UPDATE", new: row, old: {} });
// With RLS on, a deleted row comes with its primary key only.
const deleted = (id: string) => ({ eventType: "DELETE", new: {}, old: { id } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const rejection = {
  data: null,
  error: { message: "new row violates row-level security", code: "42501" },
};

const key = queryKeys.items(USER, LIST);

type Props = { userId: string | null; listId: string | null };

function useList({ userId, listId }: Props) {
  useListRealtime(userId, listId);
  return {
    list: useItems(userId, listId),
    categories: useCategories(userId, listId),
    catalog: useCatalog(userId, listId),
    add: useAddItem(userId ?? "", listId ?? ""),
    toggle: useToggleItem(userId ?? "", listId ?? ""),
    edit: useEditItem(userId ?? "", listId ?? ""),
    emptyCart: useEmptyCart(userId ?? "", listId ?? ""),
    remote: useRemoteChanges(userId, listId),
    announcement: useRemoteAnnouncement(userId, listId),
  };
}

/**
 * The list loaded and its channel joined, with the reads that the join
 * starts already answered: the mocks start counting from here.
 */
async function renderList(initial: Item[]) {
  const queryClient = makeTestQueryClient();
  readItems.mockResolvedValue({ data: initial, error: null });
  const hook = renderHook((props: Props) => useList(props), {
    wrapper: makeWrapper(queryClient),
    initialProps: { userId: USER, listId: LIST },
  });
  await waitFor(() => expect(hook.result.current.list.isSuccess).toBe(true));
  await waitFor(() => expect(live()).toHaveLength(1));
  const channel = live()[0];
  readItems.mockClear();
  channel.status("SUBSCRIBED");
  await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  readItems.mockClear();
  readCategories.mockClear();
  readCatalog.mockClear();
  return { ...hook, queryClient, channel };
}

function cached(queryClient: ReturnType<typeof makeTestQueryClient>) {
  return queryClient.getQueryData<Item[]>(key) ?? [];
}

const ids = (queryClient: ReturnType<typeof makeTestQueryClient>) =>
  cached(queryClient)
    .filter((item) => item.deleted_at === null)
    .map((item) => item.id);

/** Lets pending promises and effects run. */
const flush = () => act(async () => {});

beforeEach(() => {
  for (const mock of [
    readItems,
    writeItems,
    updateItems,
    readCategories,
    readCatalog,
  ]) {
    mock.mockReset();
  }
  readCategories.mockResolvedValue({ data: [], error: null });
  readCatalog.mockResolvedValue({ data: [], error: null });
  calls.length = 0;
  opened.length = 0;
});

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe("the list's channel", () => {
  it("listens to the list's items and categories, with the session's token", async () => {
    const { channel } = await renderList([]);
    expect(live()).toEqual([channel]);
    expect(channel.params).toEqual({
      config: { postgres_changes_options: { wait: true } },
    });
    expect(
      channel.bindings.map(({ event, schema, table, filter }) => ({
        event,
        schema,
        table,
        filter,
      })),
    ).toEqual([
      {
        event: "*",
        schema: "public",
        table: "items",
        filter: `list_id=eq.${LIST}`,
      },
      {
        event: "*",
        schema: "public",
        table: "categories",
        filter: `list_id=eq.${LIST}`,
      },
    ]);
    expect(calls).toEqual(["setAuth", "subscribe"]);
  });

  it("opens nothing without a user or a list", async () => {
    readItems.mockResolvedValue({ data: [], error: null });
    const { rerender } = renderHook((props: Props) => useList(props), {
      wrapper: makeWrapper(makeTestQueryClient()),
      initialProps: { userId: null, listId: LIST } as Props,
    });
    await flush();
    rerender({ userId: USER, listId: null });
    await flush();
    expect(opened).toHaveLength(0);
  });

  it("closes when the list or the user changes, and when the screen goes", async () => {
    readItems.mockResolvedValue({ data: [], error: null });
    const { rerender, unmount, channel } = await renderList([]);

    rerender({ userId: USER, listId: OTHER_LIST });
    await waitFor(() => expect(live()).toHaveLength(1));
    expect(channel.removed).toBe(true);
    const otherList = live()[0];
    expect(otherList.bindings[0].filter).toBe(`list_id=eq.${OTHER_LIST}`);

    // Signing out starts over as a new anonymous user.
    rerender({ userId: MEMBER, listId: OTHER_LIST });
    await waitFor(() => expect(live()).toHaveLength(1));
    expect(otherList.removed).toBe(true);
    expect(live()[0]).not.toBe(otherList);
    // Every join refreshed the token first.
    expect(calls).toEqual([
      "setAuth",
      "subscribe",
      "setAuth",
      "subscribe",
      "setAuth",
      "subscribe",
    ]);

    unmount();
    expect(live()).toHaveLength(0);
  });

  it("keeps one channel under Strict Mode", async () => {
    readItems.mockResolvedValue({ data: [], error: null });
    renderHook(() => useList({ userId: USER, listId: LIST }), {
      wrapper: makeWrapper(makeTestQueryClient()),
      reactStrictMode: true,
    });
    await waitFor(() => expect(live()).toHaveLength(1));
    await flush();
    expect(live()).toHaveLength(1);
    // A topic per opening: never the channel on its way out.
    const topics = opened.map((channel) => channel.topic);
    expect(new Set(topics).size).toBe(topics.length);
  });

  it("leaves errors to the library, which joins again on its own", async () => {
    const { channel } = await renderList([]);
    channel.status("CHANNEL_ERROR");
    channel.status("TIMED_OUT");
    await flush();
    expect(live()).toEqual([channel]);
    expect(opened).toHaveLength(1);
  });

  it("opens again, backing off, when the server closes it, and not after closing it here", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { channel, unmount } = await renderList([]);

    // The server closes the channel (an expired token): no rejoin follows.
    channel.status("CLOSED");
    expect(channel.removed).toBe(true);
    expect(live()).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await waitFor(() => expect(live()).toHaveLength(1));
    const second = live()[0];
    expect(second.topic).not.toBe(channel.topic);

    // Closed again before it joined: the next attempt waits longer.
    second.status("CLOSED");
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(live()).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await waitFor(() => expect(live()).toHaveLength(1));

    // Joined: what changed while it was closed is read again.
    live()[0].status("SUBSCRIBED");
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));

    unmount();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(live()).toHaveLength(0);
    expect(opened).toHaveLength(3);
    // Nothing tried to open it again after it was closed here.
    expect(calls.filter((call) => call === "setAuth")).toHaveLength(3);
  });
});

describe("catching up with what no event brought", () => {
  it("reads the list, its categories and its catalog each time the channel joins", async () => {
    const { channel } = await renderList([
      serverRow({ id: "milk", name: "Leche" }),
    ]);
    // Joined again after a lost connection.
    channel.status("SUBSCRIBED");
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    expect(readCategories).toHaveBeenCalledTimes(1);
    expect(readCatalog).toHaveBeenCalledTimes(1);
  });

  it("leaves the read to the last write while writes are pending", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const write = deferred<Result>();
    updateItems.mockReturnValue(write.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0].checked).toBe(true));
    channel.status("SUBSCRIBED");
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(readItems).not.toHaveBeenCalled();
    expect(cached(queryClient)[0].checked).toBe(true);

    // Once the write is done: the read of settle, then the one the join
    // asked for, which waited.
    const confirmed = { ...milk, checked: true, updated_at: at(2) };
    readItems.mockResolvedValue({ data: [confirmed], error: null });
    await act(async () => write.resolve({ data: confirmed, error: null }));
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(readItems).toHaveBeenCalledTimes(2);
    expect(cached(queryClient)).toEqual([confirmed]);
  });

  it("still reads the list when a change cancelled the read of settle while the write waited for the catalog", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    updateItems.mockResolvedValue({ data: checked, error: null });
    const settleRead = deferred<Result>();
    const catalogRead = deferred<Result>();
    const edited = { ...checked, note: "Descremada", updated_at: at(3) };
    readItems
      .mockReturnValueOnce(settleRead.promise)
      .mockResolvedValue({ data: [edited], error: null });
    readCatalog.mockReturnValueOnce(catalogRead.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    // Another member edits the row while settle reads: the event is left to
    // a read, the read in flight is cancelled, and the write stays pending
    // on the catalog's slow answer.
    channel.emit("items", updated(edited));
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(result.current.toggle.isPending).toBe(true);
    expect(readItems).toHaveBeenCalledTimes(1);
    expect(cached(queryClient)[0].note).toBeNull();

    await act(async () => catalogRead.resolve({ data: [], error: null }));
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true));
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(2));
    await act(async () => settleRead.resolve({ data: [checked], error: null }));
    await waitFor(() => expect(cached(queryClient)).toEqual([edited]));
  });

  it("reads the list on focus even when fresh, but not while a write is pending", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderList([milk]);

    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));

    readItems.mockClear();
    updateItems.mockReturnValue(new Promise(() => {}));
    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0].checked).toBe(true));
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await flush();
    expect(readItems).not.toHaveBeenCalled();
  });

  it("reads the list again after the first load when a change comes during it", async () => {
    const bread = serverRow({ id: "bread", name: "Pan" });
    const milk = serverRow({ id: "milk", name: "Leche", position: 1 });
    const firstLoad = deferred<Result>();
    readItems
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValue({ data: [bread, milk], error: null });
    const queryClient = makeTestQueryClient();
    renderHook((props: Props) => useList(props), {
      wrapper: makeWrapper(queryClient),
      initialProps: { userId: USER, listId: LIST },
    });
    await waitFor(() => expect(live()).toHaveLength(1));

    live()[0].emit("items", inserted(milk));
    expect(readItems).toHaveBeenCalledTimes(1);
    // The first load answers with the list as it was before the change.
    await act(async () => firstLoad.resolve({ data: [bread], error: null }));
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(ids(queryClient)).toEqual(["bread", "milk"]));
  });
});

describe("changes from other members", () => {
  it("adds a row another member inserted in the server's order, and pulses it", async () => {
    const bread = serverRow({ id: "a-bread", name: "Pan" });
    const rice = serverRow({ id: "c-rice", name: "Arroz", position: 1 });
    const { result, channel, queryClient } = await renderList([bread, rice]);

    const milk = serverRow({
      id: "b-milk",
      name: "Leche",
      created_by: MEMBER,
      created_at: at(5),
      updated_at: at(5),
    });
    channel.emit("items", inserted(milk));
    expect(ids(queryClient)).toEqual(["a-bread", "b-milk", "c-rice"]);
    expect([...result.current.remote]).toEqual(["b-milk"]);
    // A new product changes the catalog the next add reads.
    await waitFor(() => expect(readCatalog).toHaveBeenCalledTimes(1));
    // The pulse goes out on its own.
    await waitFor(() => expect(result.current.remote.size).toBe(0), {
      timeout: 1_500,
    });
    expect(readItems).not.toHaveBeenCalled();
  });

  it("applies a check or an edit and pulses the row; a change the list does not show does not", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);

    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    channel.emit("items", updated(checked));
    expect(cached(queryClient)).toEqual([checked]);
    expect(result.current.remote.has("milk")).toBe(true);
    await waitFor(() => expect(result.current.remote.size).toBe(0), {
      timeout: 1_500,
    });

    const priced = { ...checked, estimated_price: 120, updated_at: at(3) };
    channel.emit("items", updated(priced));
    expect(cached(queryClient)).toEqual([priced]);
    expect(result.current.remote.size).toBe(0);
  });

  it("pulses a row another member added when a read showed it before its event", async () => {
    const { result, channel, queryClient } = await renderList([]);
    const milk = serverRow({
      id: "milk",
      name: "Leche",
      created_by: MEMBER,
      created_at: at(5),
      updated_at: at(5),
    });
    // A read of the user's own (the refetch of settle, say) lands first.
    readItems.mockResolvedValue({ data: [milk], error: null });
    await act(() => queryClient.invalidateQueries({ queryKey: key }));
    expect(ids(queryClient)).toEqual(["milk"]);
    expect(result.current.remote.size).toBe(0);

    channel.emit("items", inserted(milk));
    expect(result.current.remote.has("milk")).toBe(true);
  });

  it("pulses an edit a read showed first only when the event says what changed", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const edited = { ...milk, note: "Entera", updated_at: at(2) };
    readItems.mockResolvedValue({ data: [edited], error: null });
    await act(() => queryClient.invalidateQueries({ queryKey: key }));
    expect(cached(queryClient)).toEqual([edited]);

    // Without the old record (only the key, as RLS may send it) there is no
    // telling what changed: no pulse.
    channel.emit("items", {
      eventType: "UPDATE",
      new: edited,
      old: { id: "milk" },
    });
    expect(result.current.remote.size).toBe(0);
    channel.emit("items", { eventType: "UPDATE", new: edited, old: milk });
    expect(result.current.remote.has("milk")).toBe(true);
  });

  it("ignores a change to another list", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const before = cached(queryClient);

    channel.emit(
      "items",
      inserted(serverRow({ id: "stray", name: "Ajeno", list_id: OTHER_LIST })),
    );
    expect(cached(queryClient)).toBe(before);
    expect(result.current.remote.size).toBe(0);
  });

  it("reads the categories again when they change", async () => {
    const { channel } = await renderList([]);
    channel.emit("categories", { eventType: "UPDATE", new: {}, old: {} });
    await waitFor(() => expect(readCategories).toHaveBeenCalledTimes(1));
  });
});

describe("the echo of the user's own writes", () => {
  it("changes nothing, while the add is in flight or once it answered", async () => {
    const { result, channel, queryClient } = await renderList([]);
    const write = deferred<Result>();
    writeItems.mockReturnValue(write.promise);

    const input = newItem("Yerba");
    act(() => result.current.add.mutate(input));
    await waitFor(() => expect(cached(queryClient)).toHaveLength(1));
    const optimistic = cached(queryClient)[0];

    const created = serverRow({
      id: input.id,
      name: "Yerba",
      created_at: at(5),
      updated_at: at(5),
    });
    channel.emit("items", inserted(created));
    expect(cached(queryClient)[0]).toBe(optimistic);

    readItems.mockResolvedValue({ data: [created], error: null });
    await act(async () => write.resolve({ data: created, error: null }));
    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    const settled = queryClient.getQueryData(key);
    readItems.mockClear();

    channel.emit("items", inserted(created));
    expect(queryClient.getQueryData(key)).toBe(settled);
    await flush();
    expect(readItems).not.toHaveBeenCalled();
    expect(result.current.remote.size).toBe(0);
  });

  it("does not start the refetch of settle over for the echo of the write", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    updateItems.mockResolvedValue({ data: checked, error: null });
    const read = deferred<Result>();
    readItems.mockReturnValue(read.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    // The echo usually lands while settle reads the list.
    channel.emit("items", updated(checked));
    await flush();
    expect(readItems).toHaveBeenCalledTimes(1);
    await act(async () => read.resolve({ data: [checked], error: null }));
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true));
    expect(cached(queryClient)).toEqual([checked]);
  });

  it("never pulses the echo of an own write, whatever the cache shows", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    updateItems.mockResolvedValue({ data: checked, error: null });
    readItems.mockResolvedValue({ data: [checked], error: null });
    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    // Whatever brought the cache back to an older version, the echo of the
    // check is the user's own: applied, never pulsed.
    act(() => queryClient.setQueryData(key, [milk]));
    channel.emit("items", updated(checked));
    expect(cached(queryClient)).toEqual([checked]);
    expect(result.current.remote.size).toBe(0);
  });

  it("drops a late echo of an earlier write once a later one answered", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const first = deferred<Result>();
    const second = deferred<Result>();
    updateItems
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: false,
      }),
    );
    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    const unchecked = { ...milk, updated_at: at(3) };
    await act(async () => first.resolve({ data: checked, error: null }));
    readItems.mockResolvedValue({ data: [unchecked], error: null });
    await waitFor(() => expect(updateItems).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve({ data: unchecked, error: null }));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    readItems.mockClear();

    // The first check's event arrives after the uncheck's answer.
    channel.emit("items", updated(checked));
    expect(cached(queryClient)).toEqual([unchecked]);
    expect(result.current.remote.size).toBe(0);
    await flush();
    expect(readItems).not.toHaveBeenCalled();
  });
});

describe("a change to an item with writes of the user's own pending", () => {
  it("keeps the optimistic check over an edit by another member, then shows both", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const write = deferred<Result>();
    updateItems.mockReturnValue(write.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0].checked).toBe(true));
    const edited = { ...milk, note: "Descremada", updated_at: at(2) };
    channel.emit("items", updated(edited));
    expect(cached(queryClient)[0]).toMatchObject({
      checked: true,
      note: null,
    });
    expect(result.current.remote.size).toBe(0);

    // The check reaches the server after the edit: its answer and the
    // refetch of settle carry both.
    const both = {
      ...edited,
      checked: true,
      checked_at: at(3),
      updated_at: at(3),
    };
    readItems.mockResolvedValue({ data: [both], error: null });
    await act(async () => write.resolve({ data: both, error: null }));
    await waitFor(() => expect(cached(queryClient)).toEqual([both]));
  });

  it("starts the refetch of settle over when a change arrives during it", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    updateItems.mockResolvedValue({ data: checked, error: null });
    const staleRead = deferred<Result>();
    const freshRead = deferred<Result>();
    readItems
      .mockReturnValueOnce(staleRead.promise)
      .mockReturnValueOnce(freshRead.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    // The write answered; settle is reading the list.
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    const edited = { ...checked, note: "Descremada", updated_at: at(3) };
    channel.emit("items", updated(edited));
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(2));

    // The first read was made before the edit: its answer is dropped.
    await act(async () => staleRead.resolve({ data: [checked], error: null }));
    await act(async () => freshRead.resolve({ data: [edited], error: null }));
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true));
    expect(cached(queryClient)).toEqual([edited]);
  });

  it("keeps an edit queued behind its insert over a change by another member", async () => {
    const { result, channel, queryClient } = await renderList([]);
    const insert = deferred<Result>();
    writeItems.mockReturnValue(insert.promise);
    updateItems.mockReturnValue(new Promise(() => {}));

    const input = newItem("Huevos");
    act(() => result.current.add.mutate(input));
    act(() =>
      result.current.edit.mutate({
        id: input.id,
        name: "Huevos",
        changes: { note: "De campo" },
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0]?.note).toBe("De campo"));

    const created = serverRow({
      id: input.id,
      name: "Huevos",
      updated_at: at(5),
    });
    await act(async () => insert.resolve({ data: created, error: null }));
    await waitFor(() => expect(updateItems).toHaveBeenCalledTimes(1));
    channel.emit("items", inserted(created));
    channel.emit(
      "items",
      updated({ ...created, quantity: 12, updated_at: at(6) }),
    );
    expect(cached(queryClient)[0]).toMatchObject({
      note: "De campo",
      quantity: null,
    });
    expect(result.current.remote.size).toBe(0);
  });

  it("keeps a row the user is checking when another member deletes it, until settle reads the list", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const bread = serverRow({ id: "bread", name: "Pan", position: 1 });
    const { result, channel, queryClient } = await renderList([milk, bread]);
    const write = deferred<Result>();
    updateItems.mockReturnValue(write.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0].checked).toBe(true));
    channel.emit("items", deleted("milk"));
    expect(ids(queryClient)).toEqual(["milk", "bread"]);

    // The row is gone on the server: the check finds nothing to update.
    readItems.mockResolvedValue({ data: [bread], error: null });
    await act(async () => write.resolve(rejection));
    await waitFor(() => expect(cached(queryClient)).toEqual([bread]));
  });

  it("keeps an emptying pending, and its rollback still brings the rows back", async () => {
    const milk = serverRow({
      id: "milk",
      name: "Leche",
      checked: true,
      checked_at: at(0),
    });
    const { result, channel, queryClient } = await renderList([milk]);
    const archive = deferred<Result>();
    updateItems.mockReturnValue(archive.promise);
    const AT = "2026-10-19T18:00:00.000Z";

    act(() =>
      result.current.emptyCart.mutate({ ids: ["milk"], deletedAt: AT }),
    );
    await waitFor(() => expect(cached(queryClient)[0].deleted_at).toBe(AT));
    channel.emit(
      "items",
      updated({ ...milk, note: "Entera", updated_at: at(2) }),
    );
    expect(cached(queryClient)[0]).toMatchObject({
      deleted_at: AT,
      note: null,
    });

    readItems.mockResolvedValue({
      data: [{ ...milk, note: "Entera", updated_at: at(2) }],
      error: null,
    });
    await act(async () => archive.resolve(rejection));
    await waitFor(() => expect(result.current.emptyCart.isError).toBe(true));
    await waitFor(() =>
      expect(cached(queryClient)[0]).toMatchObject({
        deleted_at: null,
        note: "Entera",
      }),
    );
  });
});

describe("rows deleted or archived by another member", () => {
  it("hides the row, and no late event brings it back", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const bread = serverRow({ id: "bread", name: "Pan", position: 1 });
    const { result, channel, queryClient } = await renderList([milk, bread]);

    channel.emit(
      "items",
      updated({ ...milk, deleted_at: at(3), updated_at: at(3) }),
    );
    expect(ids(queryClient)).toEqual(["bread"]);
    expect(result.current.remote.size).toBe(0);

    // An edit made before the deletion, delivered late.
    const late = { ...milk, note: "Entera", updated_at: at(2) };
    channel.emit("items", updated(late));
    expect(ids(queryClient)).toEqual(["bread"]);

    // The next read drops the row from the cache altogether.
    readItems.mockResolvedValue({ data: [bread], error: null });
    await act(() => queryClient.invalidateQueries({ queryKey: key }));
    expect(cached(queryClient)).toEqual([bread]);
    readItems.mockClear();

    // Not even then: an update never creates a row. The list is read again
    // instead, in case its insert was missed.
    channel.emit("items", updated(late));
    expect(ids(queryClient)).toEqual(["bread"]);
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    expect(ids(queryClient)).toEqual(["bread"]);
    expect(result.current.remote.size).toBe(0);
  });

  it("empties the cart another member emptied", async () => {
    const checkedAt = { checked: true, checked_at: at(0) };
    const milk = serverRow({ id: "milk", name: "Leche", ...checkedAt });
    const bread = serverRow({
      id: "bread",
      name: "Pan",
      position: 1,
      ...checkedAt,
    });
    const rice = serverRow({ id: "rice", name: "Arroz", position: 2 });
    const { result, channel, queryClient } = await renderList([
      milk,
      bread,
      rice,
    ]);

    for (const row of [milk, bread]) {
      channel.emit(
        "items",
        updated({ ...row, deleted_at: at(4), updated_at: at(4) }),
      );
    }
    expect(ids(queryClient)).toEqual(["rice"]);
    expect(result.current.remote.size).toBe(0);
  });

  it("hides again a row whose late insert comes after its archive was read", async () => {
    const bread = serverRow({ id: "bread", name: "Pan" });
    const { channel, queryClient } = await renderList([bread]);
    const milk = serverRow({
      id: "milk",
      name: "Leche",
      position: 1,
      created_by: MEMBER,
      created_at: at(2),
      updated_at: at(2),
    });

    // The events of a row come in order: the archive follows its insert.
    channel.emit("items", inserted(milk));
    expect(ids(queryClient)).toEqual(["bread", "milk"]);
    channel.emit(
      "items",
      updated({ ...milk, deleted_at: at(3), updated_at: at(3) }),
    );
    expect(ids(queryClient)).toEqual(["bread"]);
  });

  it("drops a row deleted for good, from its id alone", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const bread = serverRow({ id: "bread", name: "Pan", position: 1 });
    const { result, channel, queryClient } = await renderList([milk, bread]);

    channel.emit("items", deleted("milk"));
    expect(cached(queryClient)).toEqual([bread]);
    channel.emit("items", deleted("unknown"));
    expect(cached(queryClient)).toEqual([bread]);
    expect(result.current.remote.size).toBe(0);
  });
});

describe("a change that arrives while the list is being read", () => {
  it("starts the read over, so its older answer does not overwrite the change", async () => {
    const bread = serverRow({ id: "bread", name: "Pan" });
    const { result, channel, queryClient } = await renderList([bread]);
    const staleRead = deferred<Result>();
    const freshRead = deferred<Result>();
    readItems
      .mockReturnValueOnce(staleRead.promise)
      .mockReturnValueOnce(freshRead.promise);

    act(() => void queryClient.invalidateQueries({ queryKey: key }));
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    const milk = serverRow({
      id: "milk",
      name: "Leche",
      position: 1,
      created_at: at(5),
      updated_at: at(5),
    });
    channel.emit("items", inserted(milk));
    expect(ids(queryClient)).toEqual(["bread", "milk"]);
    expect(result.current.remote.has("milk")).toBe(true);
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(2));

    await act(async () => staleRead.resolve({ data: [bread], error: null }));
    expect(ids(queryClient)).toEqual(["bread", "milk"]);
    await act(async () =>
      freshRead.resolve({ data: [bread, milk], error: null }),
    );
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(ids(queryClient)).toEqual(["bread", "milk"]);
  });

  it("reads the list once for a burst of updates to rows it does not have", async () => {
    const { channel, queryClient } = await renderList([]);
    // Inserts missed while the channel was down, then edits that do arrive.
    for (const n of [1, 2, 3]) {
      channel.emit(
        "items",
        updated(
          serverRow({ id: `row-${n}`, name: "Producto", updated_at: at(n) }),
        ),
      );
    }
    expect(ids(queryClient)).toEqual([]);
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(readItems).toHaveBeenCalledTimes(1);
  });

  it("reads the list once after a burst of changes that lands during a read", async () => {
    const cart = [0, 1, 2, 3, 4].map((n) =>
      serverRow({
        id: `row-${n}`,
        name: `Producto ${n}`,
        position: n,
        checked: true,
        checked_at: at(0),
      }),
    );
    const milk = serverRow({ id: "milk", name: "Leche", position: 5 });
    const { result, channel, queryClient } = await renderList([...cart, milk]);
    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    updateItems.mockResolvedValue({ data: checked, error: null });
    const staleRead = deferred<Result>();
    readItems
      .mockReturnValueOnce(staleRead.promise)
      .mockResolvedValue({ data: [checked], error: null });

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    // Another member empties the cart: one event per row, back to back.
    for (const row of cart) {
      channel.emit(
        "items",
        updated({ ...row, deleted_at: at(3), updated_at: at(3) }),
      );
    }
    expect(ids(queryClient)).toEqual(["milk"]);
    // The read in flight is dropped, so the write does not wait for it.
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true));
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(2));
    await act(async () =>
      staleRead.resolve({ data: [...cart, checked], error: null }),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(readItems).toHaveBeenCalledTimes(2);
    expect(ids(queryClient)).toEqual(["milk"]);
  });

  it("drops a read of settle in flight when the channel joins again during it", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, channel, queryClient } = await renderList([milk]);
    const checked = {
      ...milk,
      checked: true,
      checked_at: at(2),
      updated_at: at(2),
    };
    updateItems.mockResolvedValue({ data: checked, error: null });
    const staleRead = deferred<Result>();
    // Changed while the channel was down: no event will tell.
    const edited = { ...checked, note: "Descremada", updated_at: at(3) };
    readItems
      .mockReturnValueOnce(staleRead.promise)
      .mockResolvedValue({ data: [edited], error: null });

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(1));
    channel.status("SUBSCRIBED");
    await waitFor(() => expect(readItems).toHaveBeenCalledTimes(2));
    await act(async () => staleRead.resolve({ data: [checked], error: null }));
    await waitFor(() => expect(cached(queryClient)).toEqual([edited]));
  });
});

describe("what screen readers are told", () => {
  const told = (
    kind: "added" | "checked" | "unchecked" | "edited" | "removed",
    name: string,
  ) => ({ kind, id: name, name });

  it("says one change by name, a burst of one kind by count, a mix by number", () => {
    expect(describeRemoteChanges([])).toBe("");
    expect(describeRemoteChanges([told("added", "Leche")])).toBe(
      "Agregaron “Leche”",
    );
    expect(describeRemoteChanges([told("checked", "Leche")])).toBe(
      "Pasaron “Leche” al carro",
    );
    expect(describeRemoteChanges([told("unchecked", "Leche")])).toBe(
      "Devolvieron “Leche” a pendientes",
    );
    expect(describeRemoteChanges([told("edited", "Leche")])).toBe(
      "Cambiaron “Leche”",
    );
    expect(describeRemoteChanges([told("removed", "Leche")])).toBe(
      "Sacaron “Leche” de la lista",
    );
    expect(
      describeRemoteChanges([told("removed", "Leche"), told("removed", "Pan")]),
    ).toBe("Sacaron 2 productos de la lista");
    expect(
      describeRemoteChanges([told("added", "Leche"), told("checked", "Pan")]),
    ).toBe("Hubo 2 cambios en la lista");
  });

  it("tells another member's add, check and emptied cart, once per burst", async () => {
    const bread = serverRow({
      id: "bread",
      name: "Pan",
      checked: true,
      checked_at: at(0),
    });
    const rice = serverRow({
      id: "rice",
      name: "Arroz",
      position: 1,
      checked: true,
      checked_at: at(0),
    });
    const { result, channel } = await renderList([bread, rice]);
    expect(result.current.announcement.text).toBe("");

    const milk = serverRow({
      id: "milk",
      name: "Leche",
      position: 2,
      created_by: MEMBER,
      created_at: at(5),
      updated_at: at(5),
    });
    channel.emit("items", inserted(milk));
    // Checked in the same burst: still news as an add.
    channel.emit(
      "items",
      updated({ ...milk, checked: true, checked_at: at(6), updated_at: at(6) }),
    );
    await waitFor(() =>
      expect(result.current.announcement.text).toBe("Agregaron “Leche”"),
    );

    for (const row of [bread, rice]) {
      channel.emit(
        "items",
        updated({ ...row, deleted_at: at(7), updated_at: at(7) }),
      );
    }
    await waitFor(() =>
      expect(result.current.announcement.text).toBe(
        "Sacaron 2 productos de la lista",
      ),
    );
  });

  it("reads a repeated sentence again, and says nothing of a row added and removed at once", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const bread = serverRow({ id: "bread", name: "Pan", position: 1 });
    const { result, channel } = await renderList([milk, bread]);

    channel.emit(
      "items",
      updated({ ...milk, note: "Entera", updated_at: at(2) }),
    );
    await waitFor(() =>
      expect(result.current.announcement.text).toBe("Cambiaron “Leche”"),
    );
    const first = result.current.announcement.seq;
    channel.emit(
      "items",
      updated({ ...milk, note: "Descremada", updated_at: at(3) }),
    );
    await waitFor(() =>
      expect(result.current.announcement.seq).toBe(first + 1),
    );
    expect(result.current.announcement.text).toBe("Cambiaron “Leche”");

    const eggs = serverRow({
      id: "eggs",
      name: "Huevos",
      position: 2,
      created_by: MEMBER,
      created_at: at(5),
      updated_at: at(5),
    });
    channel.emit("items", inserted(eggs));
    channel.emit("items", deleted("eggs"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 900)));
    expect(result.current.announcement.seq).toBe(first + 1);

    // A row deleted for good is told by the name the list showed.
    channel.emit("items", deleted("bread"));
    await waitFor(() =>
      expect(result.current.announcement.text).toBe(
        "Sacaron “Pan” de la lista",
      ),
    );
  });

  it("never tells the user's own changes", async () => {
    const { result, channel } = await renderList([]);
    const write = deferred<Result>();
    writeItems.mockReturnValue(write.promise);
    const input = newItem("Yerba");
    act(() => result.current.add.mutate(input));
    const created = serverRow({
      id: input.id,
      name: "Yerba",
      created_at: at(5),
      updated_at: at(5),
    });
    channel.emit("items", inserted(created));
    readItems.mockResolvedValue({ data: [created], error: null });
    await act(async () => write.resolve({ data: created, error: null }));
    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    channel.emit("items", inserted(created));
    await act(() => new Promise((resolve) => setTimeout(resolve, 900)));
    expect(result.current.announcement).toEqual({ text: "", seq: 0 });
  });
});
