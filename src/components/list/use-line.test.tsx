import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT } from "@/lib/domain";
import { queryKeys } from "@/lib/queries/keys";
import { makeTestQueryClient, makeWrapper } from "@/lib/queries/test-utils";
import { SHOPPING_KEY, useShoppingMode } from "./shopping-mode";
import { useLine, useLineFailed } from "./use-line";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";
const BAKERY = "00000000-0000-7000-8000-0000000000c1";
const VEGETABLES = "00000000-0000-7000-8000-0000000000c2";
const DAIRY = "00000000-0000-7000-8000-0000000000c3";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    throw new Error("the cache has everything these tests read");
  },
}));

const category = (id: string, name: string, position: number) => ({
  id,
  list_id: LIST,
  name,
  position,
  is_default: true,
  created_at: "",
  updated_at: "",
  deleted_at: null,
});

const CATEGORIES = [
  category(BAKERY, "Panadería", 0),
  category(VEGETABLES, "Frutas y verduras", 1),
  category(DAIRY, "Lácteos", 2),
];

let position = 0;
type Row = Omit<ReturnType<typeof makeRow>, "deleted_at"> & {
  deleted_at: string | null;
};
const row = (name: string, categoryId: string, checked = false): Row =>
  makeRow(name, categoryId, checked);
const makeRow = (name: string, categoryId: string, checked: boolean) => ({
  id: `item-${name}`,
  list_id: LIST,
  name,
  name_normalized: name.toLowerCase(),
  quantity: null,
  unit: null,
  note: null,
  category_id: categoryId,
  checked,
  checked_at: null,
  position: position++,
  estimated_price: null,
  currency: "UYU",
  created_at: "",
  updated_at: "",
  deleted_at: null,
  created_by: USER,
  trip_id: null,
});

function renderLine(items: Row[], shopping = true) {
  if (shopping) {
    localStorage.setItem(
      SHOPPING_KEY,
      JSON.stringify({ listId: LIST, since: Date.now() }),
    );
  }
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(queryKeys.items(USER, LIST), items);
  queryClient.setQueryData(queryKeys.categories(USER, LIST), CATEGORIES);
  const hook = renderHook(
    () => {
      const mode = useShoppingMode(LIST);
      return { mode, line: useLine(USER, LIST, mode.on) };
    },
    { wrapper: makeWrapper(queryClient) },
  );
  const setItems = (next: Row[]) =>
    // The observers are told on the next tick.
    act(async () => {
      queryClient.setQueryData(queryKeys.items(USER, LIST), next);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  return { ...hook, setItems };
}

const kept = () =>
  (
    JSON.parse(localStorage.getItem(SHOPPING_KEY) ?? "null") as {
      line?: unknown;
    } | null
  )?.line;

beforeEach(() => {
  localStorage.clear();
  position = 0;
});

describe("useLine", () => {
  it("is nothing while this device is not shopping", () => {
    const { result } = renderLine([row("Pan", BAKERY)], false);
    expect(result.current.line).toBeNull();
    expect(localStorage.getItem(SHOPPING_KEY)).toBeNull();
  });

  it("starts at the first station with something to pick, and keeps it", () => {
    const { result } = renderLine([
      row("Pan", BAKERY, true),
      row("Tomates", VEGETABLES),
      row("Lechuga", VEGETABLES, true),
      row("Leche", DAIRY),
    ]);
    const line = result.current.line!;
    expect(line.stations.map((one) => [one.id, one.pending])).toEqual([
      [BAKERY, 0],
      [VEGETABLES, 1],
      [DAIRY, 1],
    ]);
    expect(line.position).toEqual({ at: VEGETABLES, passed: [BAKERY] });
    expect(line.here?.items.map((item) => item.name)).toEqual([
      "Tomates",
      "Lechuga",
    ]);
    expect(line.next).toBe(DAIRY);
    expect(kept()).toEqual({
      at: VEGETABLES,
      passed: [BAKERY],
      stations: [BAKERY, VEGETABLES, DAIRY],
    });
  });

  it("moves only when told: a finished station stays on screen", async () => {
    const tomatoes = row("Tomates", VEGETABLES);
    const milk = row("Leche", DAIRY);
    const { result, setItems } = renderLine([tomatoes, milk]);
    await setItems([{ ...tomatoes, checked: true }, milk]);
    expect(result.current.line?.position.at).toBe(VEGETABLES);
    expect(result.current.line?.here?.pending).toBe(0);

    act(() => result.current.line!.move(result.current.line!.next));
    expect(result.current.line?.position).toEqual({
      at: DAIRY,
      passed: [VEGETABLES],
    });
    expect(result.current.line?.next).toBe(CHECKOUT);

    act(() => result.current.line!.move(CHECKOUT));
    expect(result.current.line?.here).toBeNull();
    expect(result.current.line?.position).toEqual({
      at: CHECKOUT,
      passed: [VEGETABLES, DAIRY],
    });
  });

  it("leaves behind a station that someone fills above where you are", async () => {
    const tomatoes = row("Tomates", VEGETABLES);
    const milk = row("Leche", DAIRY);
    const { result, setItems } = renderLine([tomatoes, milk]);
    act(() => result.current.line!.move(DAIRY));
    await setItems([tomatoes, milk, row("Pan", BAKERY)]);
    expect(result.current.line?.position).toEqual({
      at: DAIRY,
      passed: [BAKERY, VEGETABLES],
    });
  });

  it("stands at the next station when the last item of yours is removed", async () => {
    const tomatoes = row("Tomates", VEGETABLES);
    const milk = row("Leche", DAIRY);
    const { result, setItems } = renderLine([
      row("Pan", BAKERY),
      tomatoes,
      milk,
    ]);
    act(() => result.current.line!.move(VEGETABLES));
    await setItems([
      row("Pan", BAKERY),
      { ...tomatoes, deleted_at: "2026-11-11T10:00:00Z" },
      milk,
    ]);
    expect(result.current.line?.position).toEqual({
      at: DAIRY,
      passed: [BAKERY],
    });
  });

  it("finds its place again after a reload", () => {
    localStorage.setItem(
      SHOPPING_KEY,
      JSON.stringify({
        listId: LIST,
        since: Date.now(),
        line: {
          at: DAIRY,
          passed: [BAKERY, VEGETABLES],
          stations: [BAKERY, VEGETABLES, DAIRY],
        },
      }),
    );
    const { result } = renderLine(
      [row("Pan", BAKERY), row("Tomates", VEGETABLES), row("Leche", DAIRY)],
      false,
    );
    expect(result.current.line?.position).toEqual({
      at: DAIRY,
      passed: [BAKERY, VEGETABLES],
    });
  });

  it("is nothing without the categories, and says so when they failed", async () => {
    localStorage.setItem(
      SHOPPING_KEY,
      JSON.stringify({ listId: LIST, since: Date.now() }),
    );
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(queryKeys.items(USER, LIST), [row("Pan", BAKERY)]);
    // The categories are read, and the read fails (the client throws).
    const { result } = renderHook(
      () => ({
        line: useLine(USER, LIST, true),
        failed: useLineFailed(USER, LIST),
      }),
      { wrapper: makeWrapper(queryClient) },
    );
    expect(result.current.line).toBeNull();
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.line).toBeNull();
    // Nothing was kept: the trip has no place until there is a line.
    expect(kept()).toBeUndefined();
  });
});
