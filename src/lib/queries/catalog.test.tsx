import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCatalog, useForgetProduct, type CatalogEntry } from "./categories";
import { queryKeys } from "./keys";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";

/** Forgetting a product of the catalog (docs/improvements.md, M-5). */

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown; status?: number };

const read = vi.fn<() => Promise<Result>>();
const remove = vi.fn<(filters: [string, unknown][]) => Promise<Result>>();
const catalog = makeTable({
  read,
  write: () => Promise.reject(new Error("only the triggers write it")),
  remove,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => catalog.builder() }),
}));

function entry(display_name: string, times_added = 1): CatalogEntry {
  return {
    name_normalized: display_name.toLowerCase(),
    display_name,
    last_category_id: null,
    last_unit: null,
    last_price: null,
    last_currency: null,
    last_quantity: null,
    last_quantity_unit: null,
    times_added,
    last_added_at: "2026-10-21T10:00:00+00:00",
  };
}

const LECHE = entry("Leche", 5);
const TYPO = entry("Tomatse");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

async function renderCatalog(initial: CatalogEntry[]) {
  read.mockResolvedValue({ data: initial, error: null });
  const queryClient = makeTestQueryClient();
  const hook = renderHook(
    () => ({
      catalog: useCatalog(USER, LIST),
      forget: useForgetProduct(USER, LIST),
    }),
    { wrapper: makeWrapper(queryClient) },
  );
  await waitFor(() => expect(hook.result.current.catalog.isSuccess).toBe(true));
  read.mockClear();
  return { ...hook, queryClient };
}

const cached = (queryClient: ReturnType<typeof makeTestQueryClient>) =>
  queryClient.getQueryData<CatalogEntry[]>(queryKeys.catalog(USER, LIST));

beforeEach(() => {
  read.mockReset();
  remove.mockReset();
  catalog.remove.mockClear();
});

describe("useForgetProduct", () => {
  it("takes the product out at once, with one delete of that row", async () => {
    const { result, queryClient } = await renderCatalog([LECHE, TYPO]);
    const answer = deferred<Result>();
    remove.mockReturnValue(answer.promise);

    act(() =>
      result.current.forget.mutate({ key: "tomatse", name: "Tomatse" }),
    );

    await waitFor(() => expect(cached(queryClient)).toEqual([LECHE]));
    await waitFor(() =>
      expect(catalog.remove).toHaveBeenCalledWith([
        ["list_id", LIST],
        ["name_normalized", "tomatse"],
      ]),
    );
    expect(remove).toHaveBeenCalledTimes(1);

    // Then the catalog is read again.
    read.mockResolvedValue({ data: [LECHE], error: null });
    await act(async () => answer.resolve({ data: null, error: null }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(cached(queryClient)).toEqual([LECHE]);
  });

  it("brings it back when the server rejects", async () => {
    const { result, queryClient } = await renderCatalog([LECHE, TYPO]);
    remove.mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    // The read after it never answers: what the cache shows is the rollback.
    read.mockReturnValue(new Promise(() => {}));

    act(() =>
      result.current.forget.mutate({ key: "tomatse", name: "Tomatse" }),
    );

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(cached(queryClient)).toHaveLength(2));
    expect(cached(queryClient)).toEqual(expect.arrayContaining([LECHE, TYPO]));
  });
});
