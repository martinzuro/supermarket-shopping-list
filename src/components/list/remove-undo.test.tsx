import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoveItem, type Item } from "@/lib/queries";
import { queryKeys } from "@/lib/queries/keys";
import {
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "@/lib/queries/test-utils";
import { texts } from "@/lib/texts";
import { AddItemBar, NOTICE_UNDO_ID } from "./add-item-bar";

/**
 * Deleting with one tap and "Deshacer" (docs/improvements.md, M-9): the
 * bar's notice for what this device deleted, with the real mutations. The
 * server answers a moment later, as a real one does: an instant fake would
 * hide the window between the tap and the answer.
 */

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown; status?: number };

/** What the server holds: the items of the list, deleted ones included. */
let server: Item[] = [];

function serverItem(name: string, position: number): Item {
  return {
    id: `item-${name}`,
    list_id: LIST,
    name,
    name_normalized: name.toLowerCase(),
    quantity: 2,
    unit: "L",
    note: "La de vidrio",
    category_id: null,
    estimated_price: 64,
    currency: "UYU",
    checked: false,
    checked_at: null,
    position,
    created_by: USER,
    created_at: "2026-11-09T00:00:00.000Z",
    updated_at: "2026-11-09T00:00:00.000Z",
    deleted_at: null,
    trip_id: null,
  };
}

function later(result: Result, ms = 40) {
  return new Promise<Result>((resolve) =>
    setTimeout(() => resolve(result), ms),
  );
}

/** Updates as the server does them: one row by id, or the undo's rows. */
function serverUpdate(changes: unknown, filters: [string, unknown][]) {
  const [column, value] = filters[0];
  const ids = column === "id" ? ([] as string[]).concat(value as string) : [];
  const undo = filters.some(([name]) => name === "deleted_at");
  const rows = server.filter(
    (row) =>
      ids.includes(row.id) &&
      (!undo || (row.deleted_at !== null && row.trip_id === null)),
  );
  for (const row of rows) Object.assign(row, changes);
  return later({
    data: Array.isArray(value) ? rows : (rows[0] ?? null),
    error: null,
  });
}

const update = vi.fn(serverUpdate);
const readItems = vi.fn(async () => ({
  data: server.filter((row) => row.deleted_at === null),
  error: null,
}));
const items = makeTable({
  read: readItems,
  write: async () => ({ data: null, error: null }),
  update,
});
const lists = makeTable({
  read: async () => ({ data: [{ id: LIST, name: "Mi lista" }], error: null }),
  write: async () => ({ data: null, error: null }),
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) =>
      table === "lists" ? lists.builder() : items.builder(),
  }),
}));

vi.mock("@/components/session-provider", () => ({
  useSession: () => ({ status: "ready", user: { id: USER } }),
}));

const milk = () => serverItem("Leche", 0);
const bread = () => serverItem("Pan", 1);

function renderBar() {
  const queryClient = makeTestQueryClient();
  server = [milk(), bread()];
  queryClient.setQueryData(queryKeys.lists(USER), [
    { id: LIST, name: "Mi lista" },
  ]);
  queryClient.setQueryData(queryKeys.items(USER, LIST), [milk(), bread()]);
  queryClient.setQueryData(queryKeys.categories(USER, LIST), []);
  queryClient.setQueryData(queryKeys.catalog(USER, LIST), []);
  const wrapper = makeWrapper(queryClient);
  render(<AddItemBar />, { wrapper });
  // The list deletes with the same hook (list-view.tsx).
  const remover = renderHook(() => useRemoveItem(USER, LIST), { wrapper });
  return {
    queryClient,
    remove: (row: Item) =>
      remover.result.current.mutate({
        id: row.id,
        name: row.name,
        row,
        deletedAt: new Date().toISOString(),
      }),
  };
}

const r = texts.list.removed;
const infoBanner = () =>
  document.querySelector('[data-slot="banner"][data-tone="info"]');
const undoButton = () => document.getElementById(NOTICE_UNDO_ID);
const visible = (queryClient: ReturnType<typeof makeTestQueryClient>) =>
  (queryClient.getQueryData<Item[]>(queryKeys.items(USER, LIST)) ?? [])
    .filter((row) => row.deleted_at === null)
    .map((row) => row.name);

beforeEach(() => {
  update.mockClear();
  readItems.mockClear();
  items.update.mockClear();
});

describe("deleting and Deshacer (M-9)", () => {
  it("tells what was deleted, and Deshacer brings it back whole", async () => {
    const { queryClient, remove } = renderBar();

    act(() => remove(milk()));
    await waitFor(() =>
      expect(infoBanner()).toHaveTextContent(r.notice(["Leche"])),
    );
    expect(undoButton()).toHaveAccessibleName(r.undoAria(["Leche"]));
    // Said by the bar's region: the row that had it is gone.
    expect(
      document.querySelector('[data-slot="add-announcement"]'),
    ).toHaveTextContent(r.notice(["Leche"]));
    // Deleted on the server, and dropped by the refetch that follows.
    await waitFor(() => expect(server[0].deleted_at).not.toBeNull());
    await waitFor(() => expect(readItems).toHaveBeenCalled());
    await waitFor(() => expect(visible(queryClient)).toEqual(["Pan"]));

    fireEvent.click(undoButton()!);
    // At once, before the server answers, in its place.
    await waitFor(() => expect(visible(queryClient)).toEqual(["Leche", "Pan"]));
    expect(items.update).toHaveBeenLastCalledWith({ deleted_at: null }, [
      ["id", ["item-Leche"]],
      ["deleted_at", "not.is.null"],
      ["trip_id", null],
    ]);
    await waitFor(() => expect(infoBanner()).toBeNull());
    await waitFor(() => expect(server[0].deleted_at).toBeNull());
    // The same row: id, amount, price and note as before.
    expect(server[0]).toEqual(milk());
  });

  it("two deletes in a row are one notice, undone together", async () => {
    const { queryClient, remove } = renderBar();

    act(() => remove(milk()));
    await waitFor(() =>
      expect(infoBanner()).toHaveTextContent(r.notice(["Leche"])),
    );
    act(() => remove(bread()));
    await waitFor(() =>
      expect(infoBanner()).toHaveTextContent(r.notice(["Leche", "Pan"])),
    );
    expect(undoButton()).toHaveAccessibleName(r.undoAria(["Leche", "Pan"]));
    await waitFor(() => expect(visible(queryClient)).toEqual([]));

    fireEvent.click(undoButton()!);
    await waitFor(() => expect(visible(queryClient)).toEqual(["Leche", "Pan"]));
    await waitFor(() =>
      expect(server.every((row) => row.deleted_at === null)).toBe(true),
    );
    const undos = items.update.mock.calls.filter(
      ([changes]) => (changes as Item).deleted_at === null,
    );
    expect(undos).toHaveLength(1);
  });

  it("an undo tapped right after the delete leaves the row as it was", async () => {
    const { queryClient, remove } = renderBar();

    act(() => remove(milk()));
    await waitFor(() => expect(undoButton()).not.toBeNull());
    fireEvent.click(undoButton()!);

    await waitFor(() => expect(visible(queryClient)).toEqual(["Leche", "Pan"]));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(server[0]).toEqual(milk());
  });

  it("a rejected delete has its own notice, without Deshacer", async () => {
    update.mockImplementationOnce(() =>
      later({
        data: null,
        error: { message: "row-level security", code: "42501" },
      }),
    );
    const { queryClient, remove } = renderBar();

    act(() => remove(milk()));
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(texts.itemErrors.remove("Leche"));
    expect(undoButton()).toBeNull();
    expect(visible(queryClient)).toEqual(["Leche", "Pan"]);
  });
});
