import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "./keys";
import {
  useAddItem,
  useEditItem,
  useEmptyCart,
  useItems,
  useRemoveItem,
  useToggleItem,
  newItem,
  type Item,
} from "./items";
import { shouldRetryMutation } from "./errors";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown; status?: number };

const read = vi.fn<() => Promise<Result>>();
const write = vi.fn<(row: unknown) => Promise<Result>>();
const update =
  vi.fn<(changes: unknown, filters: [string, unknown][]) => Promise<Result>>();
const items = makeTable({ read, write, update });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => items.builder() }),
}));

const rejection = {
  data: null,
  error: { message: "new row violates row-level security", code: "42501" },
};

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
    created_at: "2026-10-17T00:00:00.000Z",
    updated_at: "2026-10-17T00:00:00.000Z",
    deleted_at: null,
    ...partial,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderItems(
  initial: Item[],
  queryClient = makeTestQueryClient(),
) {
  read.mockResolvedValue({ data: initial, error: null });
  const hook = renderHook(
    () => ({
      list: useItems(USER, LIST),
      add: useAddItem(USER, LIST),
      toggle: useToggleItem(USER, LIST),
      edit: useEditItem(USER, LIST),
      remove: useRemoveItem(USER, LIST),
      emptyCart: useEmptyCart(USER, LIST),
    }),
    { wrapper: makeWrapper(queryClient) },
  );
  await waitFor(() => expect(hook.result.current.list.isSuccess).toBe(true));
  read.mockClear();
  return { ...hook, queryClient };
}

function cached(queryClient: ReturnType<typeof makeTestQueryClient>) {
  return queryClient.getQueryData<Item[]>(queryKeys.items(USER, LIST)) ?? [];
}

beforeEach(() => {
  read.mockReset();
  write.mockReset();
  update.mockReset();
  items.insert.mockClear();
  items.update.mockClear();
});

describe("useAddItem (optimistic mutation pattern)", () => {
  it("shows the item at once, then replaces it with the server row", async () => {
    const { result, queryClient } = await renderItems([]);
    const pending = deferred<Result>();
    write.mockReturnValue(pending.promise);

    const input = newItem("  Leche entera ");
    act(() => result.current.add.mutate(input));

    // 1. Optimistic: in the cache before the server answers.
    await waitFor(() =>
      expect(result.current.list.data?.map((i) => i.name)).toEqual([
        "Leche entera",
      ]),
    );
    const optimistic = result.current.list.data![0];
    expect(optimistic.id).toBe(input.id);
    expect(optimistic.name_normalized).toBe("leche entera");
    expect(items.insert).toHaveBeenCalledWith({
      id: input.id,
      list_id: LIST,
      name: "Leche entera",
      quantity: null,
      unit: null,
      category_id: null,
      estimated_price: null,
      currency: "UYU",
      position: 0,
    });

    // 3. Server row replaces the optimistic one, same id.
    const created = serverRow({ id: input.id, name: "Leche entera" });
    read.mockResolvedValue({ data: [created], error: null });
    await act(async () => pending.resolve({ data: created, error: null }));
    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    expect(cached(queryClient)).toEqual([created]);
  });

  it("sends and shows the price the catalog remembers, with its currency", async () => {
    const { result } = await renderItems([]);
    write.mockReturnValue(new Promise(() => {}));

    const input = newItem("Aceite", {
      price: { price: 12.5, currency: "USD" },
    });
    act(() => result.current.add.mutate(input));
    await waitFor(() =>
      expect(result.current.list.data?.[0]).toMatchObject({
        estimated_price: 12.5,
        currency: "USD",
      }),
    );
    expect(items.insert).toHaveBeenCalledWith(
      expect.objectContaining({ estimated_price: 12.5, currency: "USD" }),
    );
  });

  it("sends and shows quantity and unit", async () => {
    const { result } = await renderItems([]);
    write.mockReturnValue(new Promise(() => {}));

    const input = newItem("Tomates", { quantity: 1.5, unit: "kg" });
    act(() => result.current.add.mutate(input));

    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    expect(result.current.list.data![0]).toMatchObject({
      quantity: 1.5,
      unit: "kg",
    });
    await waitFor(() =>
      expect(items.insert).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1.5, unit: "kg" }),
      ),
    );
  });

  it("drops only the rejected row, keeping a later add still in flight", async () => {
    const existing = serverRow({ id: "existing", name: "Pan" });
    const { result, queryClient } = await renderItems([existing]);
    const first = deferred<Result>();
    const second = deferred<Result>();
    write
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const tomatoes = newItem("Tomates");
    const rice = newItem("Arroz");
    act(() => result.current.add.mutate(tomatoes));
    act(() => result.current.add.mutate(rice));
    await waitFor(() => expect(cached(queryClient)).toHaveLength(3));
    expect(cached(queryClient).map((i) => i.position)).toEqual([0, 1, 2]);
    // Writes to a list run in series: the second waits for the first.
    expect(write).toHaveBeenCalledTimes(1);

    // 2. Rejected: only that row goes; the second add stays on screen.
    await act(async () => first.resolve(rejection));
    await waitFor(() =>
      expect(cached(queryClient).map((i) => i.name)).toEqual(["Pan", "Arroz"]),
    );
    expect(read).not.toHaveBeenCalled();

    const created = serverRow({ id: rice.id, name: "Arroz", position: 2 });
    read.mockResolvedValue({ data: [existing, created], error: null });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve({ data: created, error: null }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(cached(queryClient)).toEqual([existing, created]),
    );
  });

  it("keeps the row when a retry finds the first attempt already saved", async () => {
    // The app's retry rule, without the backoff.
    const queryClient = makeTestQueryClient();
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      mutations: { retry: shouldRetryMutation, retryDelay: 0 },
    });
    const { result } = await renderItems([], queryClient);
    const input = newItem("Yerba");
    const created = serverRow({ id: input.id, name: "Yerba" });
    // The insert reaches the server but its answer is lost (status 0); the
    // retry is told the id already exists.
    write
      .mockResolvedValueOnce({
        data: null,
        error: { message: "TypeError: Failed to fetch", code: "" },
        status: 0,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "duplicate key value", code: "23505" },
        status: 409,
      });
    read.mockResolvedValue({ data: [created], error: null });

    act(() => result.current.add.mutate(input));
    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    expect(write).toHaveBeenCalledTimes(2);
    expect(cached(queryClient)).toEqual([created]);
  });

  it("refetches once, after the last write in flight settles", async () => {
    const { result } = await renderItems([]);
    const first = deferred<Result>();
    const second = deferred<Result>();
    write
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const a = newItem("Café");
    const b = newItem("Yerba");
    act(() => result.current.add.mutate(a));
    act(() => result.current.add.mutate(b));
    await waitFor(() => expect(result.current.list.data).toHaveLength(2));

    await act(async () =>
      first.resolve({
        data: serverRow({ id: a.id, name: "Café" }),
        error: null,
      }),
    );
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.list.data).toHaveLength(2);

    read.mockResolvedValue({ data: [], error: null });
    await act(async () =>
      second.resolve({
        data: serverRow({ id: b.id, name: "Yerba", position: 1 }),
        error: null,
      }),
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  });
});

describe("useToggleItem", () => {
  it("moves the item to the cart at once and keeps the server row", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderItems([milk]);
    const pending = deferred<Result>();
    update.mockReturnValue(pending.promise);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0].checked).toBe(true));
    const checkedAt = cached(queryClient)[0].checked_at;
    expect(checkedAt).not.toBeNull();
    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith(
        { checked: true, checked_at: checkedAt },
        [["id", "milk"]],
      ),
    );

    const confirmed = { ...milk, checked: true, checked_at: checkedAt };
    read.mockResolvedValue({ data: [confirmed], error: null });
    await act(async () => pending.resolve({ data: confirmed, error: null }));
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true));
    expect(cached(queryClient)).toEqual([confirmed]);
  });

  it("unchecks with a null check time", async () => {
    const bread = serverRow({
      id: "bread",
      name: "Pan",
      checked: true,
      checked_at: "2026-10-18T10:00:00.000Z",
    });
    const { result, queryClient } = await renderItems([bread]);
    update.mockReturnValue(new Promise(() => {}));

    act(() =>
      result.current.toggle.mutate({
        id: "bread",
        name: "Pan",
        checked: false,
      }),
    );
    await waitFor(() =>
      expect(cached(queryClient)[0]).toMatchObject({
        checked: false,
        checked_at: null,
      }),
    );
    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith(
        { checked: false, checked_at: null },
        [["id", "bread"]],
      ),
    );
  });

  it("puts the item back where it was when the server rejects", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderItems([milk]);
    update.mockResolvedValue(rejection);

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    await waitFor(() => expect(result.current.toggle.isError).toBe(true));
    expect(cached(queryClient)).toEqual([milk]);
  });

  it("keeps a later toggle when an earlier one is rejected", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderItems([milk]);
    const first = deferred<Result>();
    const second = deferred<Result>();
    update
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
    await waitFor(() => expect(cached(queryClient)[0].checked).toBe(false));

    await act(async () => first.resolve(rejection));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(cached(queryClient)[0].checked).toBe(false);
    expect(update.mock.calls[1][0]).toEqual({
      checked: false,
      checked_at: null,
    });
  });

  it("waits for the insert of a new item, and the insert does not undo it", async () => {
    const { result, queryClient } = await renderItems([]);
    const insert = deferred<Result>();
    const toggle = deferred<Result>();
    write.mockReturnValue(insert.promise);
    update.mockReturnValue(toggle.promise);

    const input = newItem("Huevos");
    act(() => result.current.add.mutate(input));
    act(() =>
      result.current.toggle.mutate({
        id: input.id,
        name: "Huevos",
        checked: true,
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0]?.checked).toBe(true));
    expect(update).not.toHaveBeenCalled();

    // The insert answers with the unchecked row; the pending toggle wins.
    await act(async () =>
      insert.resolve({
        data: serverRow({ id: input.id, name: "Huevos" }),
        error: null,
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(cached(queryClient)[0].checked).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("does nothing on the server when the insert it waited for was rejected", async () => {
    const { result, queryClient } = await renderItems([]);
    const insert = deferred<Result>();
    write.mockReturnValue(insert.promise);

    const input = newItem("Huevos");
    act(() => result.current.add.mutate(input));
    act(() =>
      result.current.toggle.mutate({
        id: input.id,
        name: "Huevos",
        checked: true,
      }),
    );
    await waitFor(() => expect(cached(queryClient)).toHaveLength(1));

    read.mockResolvedValue({ data: [], error: null });
    await act(async () => insert.resolve(rejection));
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true));
    expect(update).not.toHaveBeenCalled();
    expect(result.current.toggle.isError).toBe(false);
    expect(cached(queryClient)).toEqual([]);
  });
});

describe("useEditItem", () => {
  it("shows the edit at once and sends only the changed fields", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderItems([milk]);
    const pending = deferred<Result>();
    update.mockReturnValue(pending.promise);

    act(() =>
      result.current.edit.mutate({
        id: "milk",
        name: "Leche",
        changes: {
          name: "Leche descremada",
          quantity: 2,
          note: "La de vidrio",
        },
      }),
    );
    await waitFor(() =>
      expect(cached(queryClient)[0]).toMatchObject({
        name: "Leche descremada",
        name_normalized: "leche descremada",
        quantity: 2,
        note: "La de vidrio",
      }),
    );
    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith(
        { name: "Leche descremada", quantity: 2, note: "La de vidrio" },
        [["id", "milk"]],
      ),
    );

    const saved = {
      ...milk,
      name: "Leche descremada",
      name_normalized: "leche descremada",
      quantity: 2,
      note: "La de vidrio",
    };
    read.mockResolvedValue({ data: [saved], error: null });
    await act(async () => pending.resolve({ data: saved, error: null }));
    await waitFor(() => expect(result.current.edit.isSuccess).toBe(true));
    expect(cached(queryClient)).toEqual([saved]);
  });

  it("restores the previous values when the server rejects", async () => {
    const milk = serverRow({ id: "milk", name: "Leche", unit: "L" });
    const { result, queryClient } = await renderItems([milk]);
    update.mockResolvedValue(rejection);

    act(() =>
      result.current.edit.mutate({
        id: "milk",
        name: "Leche",
        changes: { name: "Yogur", unit: null },
      }),
    );
    await waitFor(() => expect(result.current.edit.isError).toBe(true));
    expect(cached(queryClient)).toEqual([milk]);
  });

  it("keeps a later edit when an earlier one is rejected", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderItems([milk]);
    const first = deferred<Result>();
    update
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(new Promise(() => {}));

    act(() =>
      result.current.edit.mutate({
        id: "milk",
        name: "Leche",
        changes: { note: "Entera" },
      }),
    );
    act(() =>
      result.current.edit.mutate({
        id: "milk",
        name: "Leche",
        changes: { note: "Descremada" },
      }),
    );
    await waitFor(() => expect(cached(queryClient)[0].note).toBe("Descremada"));

    await act(async () => first.resolve(rejection));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(cached(queryClient)[0].note).toBe("Descremada");
  });
});

describe("useEditItem, the price", () => {
  it("shows the price and currency at once, sends only them, and puts them back if rejected", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderItems([milk]);
    update.mockResolvedValue(rejection);

    act(() =>
      result.current.edit.mutate({
        id: "milk",
        name: "Leche",
        changes: { estimated_price: 3.99, currency: "USD" },
      }),
    );
    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith(
        { estimated_price: 3.99, currency: "USD" },
        [["id", "milk"]],
      ),
    );
    await waitFor(() => expect(result.current.edit.isError).toBe(true));
    expect(cached(queryClient)).toEqual([milk]);
  });
});

describe("useEditItem, the category", () => {
  it("moves the item to the chosen category at once and sends only that", async () => {
    const milk = serverRow({ id: "milk", name: "Leche", category_id: "dairy" });
    const { result, queryClient } = await renderItems([milk]);
    const pending = deferred<Result>();
    update.mockReturnValue(pending.promise);

    act(() =>
      result.current.edit.mutate({
        id: "milk",
        name: "Leche",
        changes: { category_id: "pantry" },
      }),
    );
    await waitFor(() =>
      expect(cached(queryClient)[0].category_id).toBe("pantry"),
    );
    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith({ category_id: "pantry" }, [
        ["id", "milk"],
      ]),
    );

    const saved = {
      ...milk,
      category_id: "pantry",
      updated_at: "2026-10-17T00:00:01.000Z",
    };
    read.mockResolvedValue({ data: [saved], error: null });
    await act(async () => pending.resolve({ data: saved, error: null }));
    await waitFor(() => expect(result.current.edit.isSuccess).toBe(true));
    expect(cached(queryClient)).toEqual([saved]);
  });

  it("puts the item back in its category when the server rejects", async () => {
    const milk = serverRow({ id: "milk", name: "Leche", category_id: "dairy" });
    const { result, queryClient } = await renderItems([milk]);
    update.mockResolvedValue(rejection);

    act(() =>
      result.current.edit.mutate({
        id: "milk",
        name: "Leche",
        changes: { category_id: "pantry" },
      }),
    );
    await waitFor(() => expect(result.current.edit.isError).toBe(true));
    expect(cached(queryClient)).toEqual([milk]);
  });
});

describe("useRemoveItem", () => {
  it("drops the item from the list at once and marks it deleted on the server", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const bread = serverRow({ id: "bread", name: "Pan", position: 1 });
    const { result, queryClient } = await renderItems([milk, bread]);
    const pending = deferred<Result>();
    update.mockReturnValue(pending.promise);

    act(() => result.current.remove.mutate({ id: "milk", name: "Leche" }));
    await waitFor(() =>
      expect(
        cached(queryClient).filter((item) => item.deleted_at === null),
      ).toEqual([bread]),
    );
    const deletedAt = cached(queryClient)[0].deleted_at;
    expect(deletedAt).not.toBeNull();
    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith({ deleted_at: deletedAt }, [
        ["id", "milk"],
      ]),
    );

    // The refetch leaves the deleted row out, as the server query does.
    read.mockResolvedValue({ data: [bread], error: null });
    await act(async () =>
      pending.resolve({
        data: { ...milk, deleted_at: deletedAt },
        error: null,
      }),
    );
    await waitFor(() => expect(cached(queryClient)).toEqual([bread]));
  });

  it("brings the item back in its place when the server rejects", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const bread = serverRow({ id: "bread", name: "Pan", position: 1 });
    const { result, queryClient } = await renderItems([milk, bread]);
    update.mockResolvedValue(rejection);

    act(() => result.current.remove.mutate({ id: "milk", name: "Leche" }));
    await waitFor(() => expect(result.current.remove.isError).toBe(true));
    expect(cached(queryClient)).toEqual([milk, bread]);
  });

  it("does nothing on the server for an item whose insert was rejected", async () => {
    const { result, queryClient } = await renderItems([]);
    const insert = deferred<Result>();
    write.mockReturnValue(insert.promise);

    const input = newItem("Huevos");
    act(() => result.current.add.mutate(input));
    act(() => result.current.remove.mutate({ id: input.id, name: "Huevos" }));
    await waitFor(() =>
      expect(cached(queryClient)[0]?.deleted_at).not.toBeNull(),
    );

    read.mockResolvedValue({ data: [], error: null });
    await act(async () => insert.resolve(rejection));
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(update).not.toHaveBeenCalled();
    expect(cached(queryClient)).toEqual([]);
  });
});

describe("writes queued behind an insert", () => {
  it.each(["remove", "edit"] as const)(
    "the insert's answer does not undo a queued %s",
    async (kind) => {
      const { result, queryClient } = await renderItems([]);
      const insert = deferred<Result>();
      write.mockReturnValue(insert.promise);
      update.mockReturnValue(new Promise(() => {}));

      const input = newItem("Huevos");
      act(() => result.current.add.mutate(input));
      act(() =>
        kind === "remove"
          ? result.current.remove.mutate({ id: input.id, name: "Huevos" })
          : result.current.edit.mutate({
              id: input.id,
              name: "Huevos",
              changes: { note: "De campo" },
            }),
      );

      // The insert answers with the row as it was created.
      await act(async () =>
        insert.resolve({
          data: serverRow({ id: input.id, name: "Huevos" }),
          error: null,
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const item = cached(queryClient)[0];
      if (kind === "remove") expect(item.deleted_at).not.toBeNull();
      else expect(item.note).toBe("De campo");
      expect(read).not.toHaveBeenCalled();
    },
  );
});

describe("useEmptyCart", () => {
  const AT = "2026-10-19T18:00:00.000Z";
  const checked = { checked: true, checked_at: "2026-10-19T17:00:00.000Z" };

  it("archives the cart at once with one timestamp and one request", async () => {
    const milk = serverRow({ id: "milk", name: "Leche", ...checked });
    const bread = serverRow({
      id: "bread",
      name: "Pan",
      position: 1,
      ...checked,
    });
    const rice = serverRow({ id: "rice", name: "Arroz", position: 2 });
    const { result, queryClient } = await renderItems([milk, bread, rice]);
    const pending = deferred<Result>();
    update.mockReturnValue(pending.promise);

    act(() =>
      result.current.emptyCart.mutate({
        ids: ["milk", "bread"],
        deletedAt: AT,
      }),
    );
    await waitFor(() =>
      expect(
        cached(queryClient).filter((item) => item.deleted_at === null),
      ).toEqual([rice]),
    );
    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith({ deleted_at: AT }, [
        ["id", ["milk", "bread"]],
        ["deleted_at", null],
        ["checked", true],
      ]),
    );
    expect(update).toHaveBeenCalledTimes(1);

    read.mockResolvedValue({ data: [rice], error: null });
    await act(async () =>
      pending.resolve({
        data: [
          { ...milk, deleted_at: AT },
          { ...bread, deleted_at: AT },
        ],
        error: null,
      }),
    );
    await waitFor(() => expect(cached(queryClient)).toEqual([rice]));
  });

  it("brings the cart back when the server rejects", async () => {
    const milk = serverRow({ id: "milk", name: "Leche", ...checked });
    const { result, queryClient } = await renderItems([milk]);
    update.mockResolvedValue(rejection);

    act(() =>
      result.current.emptyCart.mutate({ ids: ["milk"], deletedAt: AT }),
    );
    await waitFor(() => expect(result.current.emptyCart.isError).toBe(true));
    expect(cached(queryClient)).toEqual([milk]);
  });

  it("does not bring back a row a toggle answered while the emptying waited", async () => {
    const milk = serverRow({ id: "milk", name: "Leche" });
    const { result, queryClient } = await renderItems([milk]);
    const toggle = deferred<Result>();
    update
      .mockReturnValueOnce(toggle.promise)
      .mockReturnValueOnce(new Promise(() => {}));

    act(() =>
      result.current.toggle.mutate({
        id: "milk",
        name: "Leche",
        checked: true,
      }),
    );
    act(() =>
      result.current.emptyCart.mutate({ ids: ["milk"], deletedAt: AT }),
    );
    await waitFor(() => expect(cached(queryClient)[0].deleted_at).toBe(AT));

    // The toggle answers with the live row; the queued emptying wins.
    await act(async () =>
      toggle.resolve({ data: { ...milk, ...checked }, error: null }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(cached(queryClient)[0].deleted_at).toBe(AT);
  });

  it("does not archive a row whose check was rejected while the emptying waited", async () => {
    const milk = serverRow({ id: "milk", name: "Leche", ...checked });
    const bread = serverRow({ id: "bread", name: "Pan", position: 1 });
    const { result, queryClient } = await renderItems([milk, bread]);
    const toggle = deferred<Result>();
    update
      .mockReturnValueOnce(toggle.promise)
      .mockReturnValueOnce(new Promise(() => {}));

    act(() =>
      result.current.toggle.mutate({ id: "bread", name: "Pan", checked: true }),
    );
    act(() =>
      result.current.emptyCart.mutate({
        ids: ["milk", "bread"],
        deletedAt: AT,
      }),
    );
    await act(async () => toggle.resolve(rejection));

    // Only Leche goes; Pan is pending again, hidden until the refetch.
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]).toEqual([
      { deleted_at: AT },
      [
        ["id", ["milk"]],
        ["deleted_at", null],
        ["checked", true],
      ],
    ]);
    expect(
      cached(queryClient).find((item) => item.id === "bread"),
    ).toMatchObject({
      checked: false,
    });
  });

  it("skips rows whose insert was rejected", async () => {
    const milk = serverRow({ id: "milk", name: "Leche", ...checked });
    const { result } = await renderItems([milk]);
    const insert = deferred<Result>();
    write.mockReturnValue(insert.promise);
    update.mockReturnValue(new Promise(() => {}));

    const eggs = newItem("Huevos");
    act(() => result.current.add.mutate(eggs));
    act(() =>
      result.current.emptyCart.mutate({
        ids: ["milk", eggs.id],
        deletedAt: AT,
      }),
    );
    await act(async () => insert.resolve(rejection));

    await waitFor(() =>
      expect(items.update).toHaveBeenCalledWith({ deleted_at: AT }, [
        ["id", ["milk"]],
        ["deleted_at", null],
        ["checked", true],
      ]),
    );
  });
});
