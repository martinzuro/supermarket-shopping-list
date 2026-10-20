import { act, renderHook, waitFor } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categoryStep,
  useCategories,
  useMoveCategory,
  type Category,
  type MoveCategory,
} from "./categories";
import { isAccessRejection, RequestError } from "./errors";
import { queryKeys } from "./keys";
import {
  makeRpc,
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown; status?: number };

const read = vi.fn<() => Promise<Result>>();
const callRpc = vi.fn<(name: string, args: unknown) => Promise<Result>>();
const categories = makeTable({
  read,
  write: () => Promise.reject(new Error("read-only table")),
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => categories.builder(),
    rpc: makeRpc((name, args) => callRpc(name, args)),
  }),
}));

/** Timestamps as Postgres writes them, `n` microseconds apart. */
const at = (n: number) =>
  `2026-10-20T10:00:00.${String(n).padStart(6, "0")}+00:00`;

function category(id: string, name: string, position: number): Category {
  return {
    id,
    list_id: LIST,
    name,
    position,
    is_default: true,
    created_at: at(0),
    updated_at: at(0),
    deleted_at: null,
  };
}

const ROUTE = [
  category("veg", "Frutas y verduras", 0),
  category("meat", "Carnes y pescados", 1),
  category("dairy", "Fiambres y lácteos", 2),
  category("other", "Otros", 3),
];

/** What the server answers: the route with the move applied, newer rows. */
function routeOf(ids: string[], version = 1): Category[] {
  return ids.map((id, position) => {
    const known = ROUTE.find((c) => c.id === id)!;
    return known.position === position
      ? known
      : { ...known, position, updated_at: at(version) };
  });
}

/**
 * Answers like the network: on a timer, never in the same microtask, and
 * slower than waitFor polls (50 ms), so the optimistic state is seen.
 */
function later(result: Result, ms = 150) {
  return new Promise<Result>((resolve) =>
    setTimeout(() => resolve(result), ms),
  );
}

const rejection = {
  data: null,
  error: { message: "category_not_found", code: "P0001" },
};

const key = queryKeys.categories(USER, LIST);

async function renderRoute(initial: Category[] = ROUTE) {
  const queryClient = makeTestQueryClient();
  read.mockImplementation(() => later({ data: initial, error: null }, 5));
  const hook = renderHook(
    () => ({
      route: useCategories(USER, LIST),
      move: useMoveCategory(USER, LIST),
    }),
    { wrapper: makeWrapper(queryClient) },
  );
  await waitFor(() => expect(hook.result.current.route.isSuccess).toBe(true));
  read.mockClear();
  return { ...hook, queryClient };
}

const order = (route: Category[] | undefined) => route?.map((c) => c.id);

function step(route: Category[] | undefined, id: string, up: boolean) {
  const target = route!.find((c) => c.id === id)!;
  return categoryStep(route!, target, up ? "up" : "down")!;
}

beforeEach(() => {
  read.mockReset();
  callRpc.mockReset();
});

afterEach(() => {
  focusManager.setFocused(undefined);
});

describe("categoryStep", () => {
  it("moves past the category next to it", () => {
    expect(categoryStep(ROUTE, ROUTE[2], "up")).toEqual({
      id: "dairy",
      name: "Fiambres y lácteos",
      direction: "up",
      past: "meat",
    });
    expect(categoryStep(ROUTE, ROUTE[2], "down")?.past).toBe("other");
  });

  it("is null at either end", () => {
    expect(categoryStep(ROUTE, ROUTE[0], "up")).toBeNull();
    expect(categoryStep(ROUTE, ROUTE[3], "down")).toBeNull();
  });
});

describe("useMoveCategory", () => {
  it("moves the category at once, sends the move and keeps the server's route", async () => {
    const { result, queryClient } = await renderRoute();
    const answer = routeOf(["veg", "dairy", "meat", "other"]);
    callRpc.mockImplementation(() => later({ data: answer, error: null }));
    read.mockImplementation(() => later({ data: answer, error: null }));

    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "dairy", true),
      ),
    );

    await waitFor(() =>
      expect(order(result.current.route.data)).toEqual([
        "veg",
        "dairy",
        "meat",
        "other",
      ]),
    );
    expect(callRpc).toHaveBeenCalledWith("move_category", {
      target_category_id: "dairy",
      direction: "up",
      past_category_id: "meat",
    });
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
    expect(queryClient.getQueryData(key)).toEqual(answer);
    // One read once the move settled.
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("sends quick moves in order, each past the category next to it then", async () => {
    const { result, queryClient } = await renderRoute();
    const answers = [
      routeOf(["veg", "meat", "other", "dairy"], 1),
      routeOf(["veg", "other", "meat", "dairy"], 2),
      routeOf(["other", "veg", "meat", "dairy"], 3),
    ];
    const sent: MoveCategory[] = [];
    callRpc.mockImplementation((_name, args) => {
      const move = args as {
        target_category_id: string;
        past_category_id: string;
      };
      sent.push({
        id: move.target_category_id,
        past: move.past_category_id,
      } as MoveCategory);
      return later({ data: answers[sent.length - 1], error: null });
    });
    read.mockImplementation(() => later({ data: answers[2], error: null }));
    // Every route the screen shows, to catch one that jumps back.
    const shown: string[][] = [];
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      const route = queryClient.getQueryData<Category[]>(key);
      const ids = [...route!]
        .sort((a, b) => a.position - b.position)
        .map((c) => c.id);
      if (shown.at(-1)?.join() !== ids.join()) shown.push(ids);
    });

    // Fiambres down once, then Otros up twice, before any answer.
    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "dairy", false),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[3]).toBe("dairy"),
    );
    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "other", true),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[1]).toBe("other"),
    );
    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "other", true),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[0]).toBe("other"),
    );

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    unsubscribe();
    expect(sent.map((m) => `${m.id}>${m.past}`)).toEqual([
      "dairy>other",
      "other>meat",
      "other>veg",
    ]);
    expect(shown).toEqual([
      ["veg", "meat", "other", "dairy"],
      ["veg", "other", "meat", "dairy"],
      ["other", "veg", "meat", "dairy"],
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("puts the category back when the server rejects the move", async () => {
    const { result, queryClient } = await renderRoute();
    callRpc.mockImplementation(() => later(rejection));
    read.mockImplementation(() => later({ data: ROUTE, error: null }));

    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "meat", false),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[2]).toBe("meat"),
    );
    await waitFor(() => expect(result.current.move.isError).toBe(true));
    expect(order(queryClient.getQueryData(key))).toEqual(order(ROUTE));
  });

  it("does not undo a later move when an earlier one is rejected", async () => {
    const { result, queryClient } = await renderRoute();
    const later2 = routeOf(["dairy", "veg", "meat", "other"], 2);
    callRpc
      .mockImplementationOnce(() => later(rejection))
      .mockImplementationOnce(() => later({ data: later2, error: null }));
    read.mockImplementation(() => later({ data: later2, error: null }));

    // Fiambres up twice: past Carnes, then past Frutas.
    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "dairy", true),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[1]).toBe("dairy"),
    );
    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "dairy", true),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[0]).toBe("dairy"),
    );

    // The first is rejected: Fiambres is no longer right before Carnes (the
    // second move put it first), so nothing is undone.
    await waitFor(() => expect(callRpc).toHaveBeenCalledTimes(2));
    expect(order(queryClient.getQueryData(key))).toEqual([
      "dairy",
      "veg",
      "meat",
      "other",
    ]);
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(order(queryClient.getQueryData(key))).toEqual(order(later2));
  });

  it("undoes the last move only, when it is the one rejected", async () => {
    const { result, queryClient } = await renderRoute();
    const first = routeOf(["veg", "dairy", "meat", "other"], 1);
    callRpc
      .mockImplementationOnce(() => later({ data: first, error: null }))
      .mockImplementationOnce(() => later(rejection));
    read.mockImplementation(() => later({ data: first, error: null }));

    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "dairy", true),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[1]).toBe("dairy"),
    );
    act(() =>
      result.current.move.mutate(
        step(result.current.route.data, "dairy", true),
      ),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[0]).toBe("dairy"),
    );

    await waitFor(() => expect(result.current.move.isError).toBe(true));
    expect(order(queryClient.getQueryData(key))).toEqual(order(first));
  });

  it("does not read the route on focus while a move is pending", async () => {
    const { result } = await renderRoute();
    callRpc.mockReturnValue(new Promise(() => {}));

    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    read.mockClear();

    act(() =>
      result.current.move.mutate(step(result.current.route.data, "meat", true)),
    );
    await waitFor(() =>
      expect(order(result.current.route.data)?.[0]).toBe("meat"),
    );
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(read).not.toHaveBeenCalled();
    expect(order(result.current.route.data)?.[0]).toBe("meat");
  });
});

describe("a move the server cannot find", () => {
  it("reads the lists again: the user may be out of the list", () => {
    expect(isAccessRejection(new RequestError(rejection.error, 400))).toBe(
      true,
    );
  });
});
