import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "./keys";
import { useAddItem, useItems, newItem, type Item } from "./items";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

const read = vi.fn<() => Promise<{ data: unknown; error: unknown }>>();
const write =
  vi.fn<(row: unknown) => Promise<{ data: unknown; error: unknown }>>();
const items = makeTable({ read, write });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => items.builder() }),
}));

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

describe("useAddItem (optimistic mutation pattern)", () => {
  beforeEach(() => {
    read.mockReset();
    write.mockReset();
    items.insert.mockClear();
  });

  it("shows the item at once, then replaces it with the server row", async () => {
    read.mockResolvedValue({ data: [], error: null });
    const pending = deferred<{ data: unknown; error: unknown }>();
    write.mockReturnValue(pending.promise);

    const queryClient = makeTestQueryClient();
    const { result } = renderHook(
      () => ({ list: useItems(USER, LIST), add: useAddItem(USER, LIST) }),
      { wrapper: makeWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

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
      position: 0,
    });

    // 3. Server row replaces the optimistic one, same id.
    const created = serverRow({ id: input.id, name: "Leche entera" });
    read.mockResolvedValue({ data: [created], error: null });
    await act(async () => pending.resolve({ data: created, error: null }));
    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData<Item[]>(queryKeys.items(USER, LIST)),
    ).toEqual([created]);
  });

  it("rolls the cache back when the server rejects the insert", async () => {
    const existing = serverRow({ id: "existing", name: "Pan" });
    read.mockResolvedValue({ data: [existing], error: null });
    const pending = deferred<{ data: unknown; error: unknown }>();
    write.mockReturnValue(pending.promise);

    const queryClient = makeTestQueryClient();
    const { result } = renderHook(
      () => ({ list: useItems(USER, LIST), add: useAddItem(USER, LIST) }),
      { wrapper: makeWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => result.current.add.mutate(newItem("Tomates")));
    await waitFor(() => expect(result.current.list.data).toHaveLength(2));
    expect(result.current.list.data![1].position).toBe(1);

    // 2. Rejected: the snapshot comes back.
    await act(async () => pending.reject(new Error("rls")));
    await waitFor(() => expect(result.current.add.isError).toBe(true));
    expect(result.current.list.data).toEqual([existing]);
  });
});
