import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "@/lib/queries/test-utils";
import { queryKeys } from "@/lib/queries/keys";
import { texts } from "@/lib/texts";
import { AddItemBar } from "./add-item-bar";

/**
 * What the catalog adds to the add bar: the combobox, the frequents row,
 * "Lo de siempre" and the notices of its rejections.
 */

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown; status?: number };

const write = vi.fn<(row: unknown) => Promise<Result>>();
const update =
  vi.fn<(changes: unknown, filters: [string, unknown][]) => Promise<Result>>();
/** What the server holds: the items of the list. */
let server: ReturnType<typeof serverItem>[] = [];
const lists = makeTable({
  read: async () => ({ data: [{ id: LIST, name: "Mi lista" }], error: null }),
  write: async () => ({ data: null, error: null }),
});
const readItems = vi.fn<() => Promise<Result>>();
const items = makeTable({ read: readItems, write, update });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) =>
      table === "lists" ? lists.builder() : items.builder(),
  }),
}));

vi.mock("@/components/session-provider", () => ({
  useSession: () => ({ status: "ready", user: { id: USER } }),
}));

const VEGETABLES = "00000000-0000-7000-8000-0000000000c1";
const DAIRY = "00000000-0000-7000-8000-0000000000c2";
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
  category(VEGETABLES, "Frutas y verduras", 0),
  category(DAIRY, "Fiambres y lácteos", 2),
];

const rejection = {
  data: null,
  error: { message: "new row violates row-level security", code: "42501" },
};

const RECENT = new Date().toISOString();
const LONG_AGO = new Date(Date.now() - 400 * 86_400_000).toISOString();

function entry(
  display_name: string,
  times_added: number,
  extra: Record<string, unknown> = {},
) {
  return {
    name_normalized: display_name.toLowerCase(),
    display_name,
    last_category_id: null,
    last_unit: null,
    last_price: null,
    last_currency: null,
    times_added,
    last_added_at: RECENT,
    ...extra,
  };
}

// Usual (3+ times, recently): Arroz, Leche, Tomates, Pan. Frequent too:
// Yerba. Neither: Lechuga (once), Atún (often, long ago: frequent only).
const CATALOG = [
  entry("Leche", 5, {
    last_category_id: DAIRY,
    last_price: 45,
    last_currency: "UYU",
  }),
  entry("Lechuga", 1, { last_category_id: VEGETABLES }),
  // Priced per kilo: its price comes along with "2 kg tom", not with a
  // bare "tomates" (another basis).
  entry("Tomates", 4, {
    last_category_id: VEGETABLES,
    last_unit: "kg",
    last_price: 90,
    last_currency: "UYU",
  }),
  entry("Pan", 3),
  entry("Arroz", 6),
  entry("Yerba", 2),
  entry("Atún", 9, { last_added_at: LONG_AGO }),
];

function serverItem(name: string, extra: Record<string, unknown> = {}) {
  return {
    id: `item-${name}`,
    list_id: LIST,
    name,
    name_normalized: name.toLowerCase(),
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
    created_at: RECENT,
    updated_at: RECENT,
    deleted_at: null,
    ...extra,
  };
}

/** What the server answers to an insert: the rows it was sent, saved. */
function saved(payload: unknown): Result {
  const rows = ([] as Record<string, unknown>[]).concat(
    payload as Record<string, unknown>,
  );
  const stored = rows.map((row) => serverItem(String(row.name), row));
  server.push(...stored);
  return { data: Array.isArray(payload) ? stored : stored[0], error: null };
}

/** The archive of the ids in the filters, as the server does it. */
function archived(changes: unknown, filters: [string, unknown][]): Result {
  const ids = (filters.find(([column]) => column === "id")?.[1] ??
    []) as string[];
  const rows = server.filter((row) => ids.includes(row.id));
  for (const row of rows) Object.assign(row, changes);
  return { data: rows, error: null };
}

async function renderBar({
  catalog = CATALOG as unknown[],
  pending = [] as string[],
} = {}) {
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(queryKeys.lists(USER), [
    { id: LIST, name: "Mi lista" },
  ]);
  queryClient.setQueryData(
    queryKeys.items(USER, LIST),
    pending.map((name) => serverItem(name)),
  );
  queryClient.setQueryData(queryKeys.categories(USER, LIST), CATEGORIES);
  queryClient.setQueryData(queryKeys.catalog(USER, LIST), catalog);
  server = pending.map((name) => serverItem(name));
  render(<AddItemBar />, { wrapper: makeWrapper(queryClient) });
  const field = screen.getByRole<HTMLInputElement>("combobox", {
    name: texts.addItem.label,
  });
  field.focus();
  return { field, queryClient };
}

/** Types into the uncontrolled field, as a person does. */
function type(field: HTMLInputElement, text: string) {
  fireEvent.change(field, { target: { value: text } });
}

const queryOptions = () => screen.queryAllByRole("option");
const names = () =>
  queryOptions().map(
    (option) => option.querySelector("span.truncate")?.textContent,
  );
const frequents = () =>
  screen.queryByRole("group", { name: texts.addItem.frequents });
const banner = () => document.querySelector('[data-slot="banner"]');
const usualsButton = (count: number) =>
  screen.queryByRole("button", { name: texts.addItem.usuals.aria(count) });

beforeEach(() => {
  readItems.mockReset();
  readItems.mockImplementation(async () => ({
    data: server.filter((row) => row.deleted_at === null),
    error: null,
  }));
  write.mockReset();
  write.mockImplementation(async (row) => saved(row));
  update.mockReset();
  update.mockImplementation(async (changes, filters) =>
    archived(changes, filters),
  );
  items.insert.mockClear();
  items.update.mockClear();
});

describe("the add field as a combobox", () => {
  it("is collapsed with nothing typed, and expands with the options", async () => {
    const { field } = await renderBar();
    expect(field).toHaveAttribute("aria-autocomplete", "list");
    expect(field).toHaveAttribute("aria-expanded", "false");
    // It points to the list only while the list is there.
    expect(field).not.toHaveAttribute("aria-controls");
    expect(field).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).toBeNull();

    type(field, "lec");

    expect(field).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox", {
      name: texts.addItem.suggestions,
    });
    expect(field).toHaveAttribute("aria-controls", list.id);
    // The best match sits next to the field, at the bottom.
    expect(names()).toEqual(["Lechuga", "Leche"]);
  });

  it("filters by the name part of what is typed, never what is pending", async () => {
    const { field } = await renderBar({ pending: ["Lechuga"] });

    type(field, "2 kg lec");
    expect(names()).toEqual(["Leche"]);

    type(field, "zzz");
    expect(field).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("offers at most five options from the first character", async () => {
    const many = Array.from({ length: 8 }, (_, n) => entry(`Pera ${n}`, 1));
    const { field } = await renderBar({ catalog: many });

    type(field, "p");

    expect(queryOptions()).toHaveLength(5);
  });

  it("moves the active option with the arrows and adds it with Enter", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar();
    type(field, "lec");
    const [lechuga, leche] = queryOptions();

    // Up from the field reaches the option next to it first.
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(leche).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", leche.id);
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(lechuga).toHaveAttribute("aria-selected", "true");
    expect(leche).toHaveAttribute("aria-selected", "false");
    expect(field).toHaveAttribute("aria-activedescendant", lechuga.id);
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field).toHaveAttribute("aria-activedescendant", leche.id);

    // Enter adds the active option and keeps the text of the field for it.
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(false);

    await waitFor(() =>
      expect(items.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Leche",
          category_id: DAIRY,
          estimated_price: 45,
        }),
      ),
    );
    expect(field.value).toBe("");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  it("adds what is typed with Enter when no option is active", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar();
    type(field, "lec");

    // Not handled by the combobox: the form submits.
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(true);
    fireEvent.submit(field.form!);

    await waitFor(() =>
      expect(items.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: "lec" }),
      ),
    );
  });

  it("closes with Escape and opens again when the text changes", async () => {
    const { field } = await renderBar();
    type(field, "lec");
    fireEvent.keyDown(field, { key: "ArrowUp" });

    expect(fireEvent.keyDown(field, { key: "Escape" })).toBe(false);
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(field).not.toHaveAttribute("aria-activedescendant");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(field.value).toBe("lec");

    type(field, "lech");
    expect(field).toHaveAttribute("aria-expanded", "true");
    // Back to the text Escape closed it on: it is a change, it stays open.
    type(field, "lec");
    expect(field).toHaveAttribute("aria-expanded", "true");
  });

  it("adds an option with a tap, keeping the quantity typed and the focus", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar();
    type(field, "2 kg tom");

    const option = screen.getByRole("option", { name: /^Tomates/ });
    // The tap does not take the focus from the field.
    expect(fireEvent.mouseDown(option)).toBe(false);
    expect(fireEvent.pointerDown(option)).toBe(false);
    fireEvent.click(option);

    await waitFor(() =>
      expect(items.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Tomates",
          quantity: 2,
          unit: "kg",
          category_id: VEGETABLES,
          estimated_price: 90,
          currency: "UYU",
        }),
      ),
    );
    expect(field.value).toBe("");
    expect(field).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("takes a second tap at the same spot right after as a double tap, not as another add", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar();
    type(field, "tom");
    const at = { clientX: 120, clientY: 640 };
    const leche = () =>
      screen.queryByRole("button", { name: texts.addItem.addProduct("Leche") });

    fireEvent.click(screen.getByRole("option", { name: /^Tomates/ }), {
      detail: 1,
      ...at,
    });
    await waitFor(() => expect(items.insert).toHaveBeenCalledTimes(1));
    // Under the finger now: the frequents row, back with the field empty.
    fireEvent.click(leche()!, { detail: 2, ...at });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    // Not added: it would have left the row (pending at once).
    expect(leche()).not.toBeNull();
  });

  it("takes a tap at the same spot as a new one when something was typed in between", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar();
    const at = { clientX: 120, clientY: 640 };
    type(field, "tom");
    fireEvent.click(screen.getByRole("option", { name: /^Tomates/ }), {
      detail: 1,
      ...at,
    });
    await waitFor(() => expect(field.value).toBe(""));
    type(field, "lec");
    fireEvent.click(screen.getByRole("option", { name: /^Leche/ }), {
      detail: 1,
      ...at,
    });
    await waitFor(() =>
      expect(items.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Tomates" }),
      ),
    );
    // The second add is pending at once (its insert waits in the queue).
    await waitFor(() => expect(field.value).toBe(""));
    type(field, "lec");
    expect(screen.queryByRole("option", { name: /^Leche/ })).toBeNull();
  });

  it("adds both when two taps land on two different products, however quick", async () => {
    write.mockReturnValue(new Promise(() => {}));
    await renderBar();
    const chip = (name: string) =>
      screen.queryByRole("button", { name: texts.addItem.addProduct(name) });

    fireEvent.click(chip("Leche")!, { detail: 1, clientX: 120, clientY: 700 });
    fireEvent.click(chip("Yerba")!, { detail: 1, clientX: 260, clientY: 700 });
    // Both pending at once (the second insert waits for the first in the
    // list's queue): both left the row.
    await waitFor(() => expect(chip("Leche")).toBeNull());
    await waitFor(() => expect(chip("Yerba")).toBeNull());
  });

  it("shows a price on an option only when the add would bring it", async () => {
    const { field } = await renderBar();
    // Tomates is priced per kilo: not for a bare "tom"...
    type(field, "tom");
    expect(
      screen.getByRole("option", { name: /^Tomates/ }),
    ).not.toHaveTextContent("90");
    // ...but for "2 kg tom".
    type(field, "2 kg tom");
    expect(screen.getByRole("option", { name: /^Tomates/ })).toHaveTextContent(
      "90",
    );
  });

  it("puts what was typed back, and says so, when the server rejects a tap", async () => {
    write.mockResolvedValue(rejection);
    const { field } = await renderBar();
    type(field, "tom");

    fireEvent.click(screen.getByRole("option", { name: /^Tomates/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(texts.itemErrors.add("Tomates"));
    expect(alert).toHaveTextContent(texts.itemErrors.addRestored);
    expect(field.value).toBe("tom");
  });

  it("does not offer the list when the field has lost the focus", async () => {
    const { field } = await renderBar();
    type(field, "lec");
    fireEvent.blur(field);
    expect(field).toHaveAttribute("aria-expanded", "false");
    fireEvent.focus(field);
    expect(field).toHaveAttribute("aria-expanded", "true");
  });
});

describe("the frequents row", () => {
  it("does not exist without history", async () => {
    await renderBar({ catalog: [entry("Leche", 1), entry("Pan", 1)] });
    expect(frequents()).toBeNull();
    expect(document.querySelector('[data-slot="frequents-row"]')).toBeNull();

    // Nor with an empty catalog.
    expect(usualsButton(0)).toBeNull();
  });

  it("shows Lo de siempre with its count, then the frequent products", async () => {
    await renderBar();

    const row = frequents()!;
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      texts.addItem.usuals.aria(4),
      // By use: Atún 9, Arroz 6, Leche 5, Tomates 4, Pan 3, Yerba 2.
      texts.addItem.addProduct("Atún"),
      texts.addItem.addProduct("Arroz"),
      texts.addItem.addProduct("Leche"),
      texts.addItem.addProduct("Tomates"),
      texts.addItem.addProduct("Pan"),
      texts.addItem.addProduct("Yerba"),
    ]);
    expect(usualsButton(4)).toHaveTextContent(texts.addItem.usuals.label);
  });

  it("leaves out what is pending, and the usuals button with fewer than two", async () => {
    await renderBar({ pending: ["Leche", "Tomates", "Arroz"] });

    const row = frequents()!;
    expect(within(row).queryByRole("button", { name: /Leche/ })).toBeNull();
    // Only Pan is left of the usuals: nothing to add "de una vez".
    expect(usualsButton(1)).toBeNull();
    expect(
      within(row).queryByRole("button", { name: /Lo de siempre/ }),
    ).toBeNull();
    expect(
      within(row).getByRole("button", {
        name: texts.addItem.addProduct("Pan"),
      }),
    ).toBeInTheDocument();
  });

  it("adds a product with a tap and it leaves the row", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar();

    const chip = screen.getByRole("button", {
      name: texts.addItem.addProduct("Leche"),
    });
    expect(fireEvent.mouseDown(chip)).toBe(false);
    fireEvent.click(chip);

    await waitFor(() =>
      expect(items.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Leche",
          quantity: null,
          category_id: DAIRY,
          estimated_price: 45,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: texts.addItem.addProduct("Leche"),
        }),
      ).toBeNull(),
    );
    expect(field).toHaveFocus();
  });

  it("is replaced by the suggestions while typing", async () => {
    const { field } = await renderBar();
    expect(frequents()).not.toBeNull();

    type(field, "l");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await waitFor(() => expect(frequents()).toBeNull());

    // Typing something with no suggestions leaves the bar with only the field.
    type(field, "zzz");
    expect(frequents()).toBeNull();
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

    type(field, "");
    expect(frequents()).not.toBeNull();
  });

  it("a rejected tap says so and puts nothing back in the field", async () => {
    write.mockResolvedValue(rejection);
    const { field } = await renderBar();

    fireEvent.click(
      screen.getByRole("button", { name: texts.addItem.addProduct("Leche") }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(texts.itemErrors.add("Leche"));
    expect(alert).toHaveTextContent(texts.itemErrors.addLost);
    expect(field.value).toBe("");
  });
});

describe("Lo de siempre", () => {
  it("adds every usual product that is not pending in one write", async () => {
    const { field } = await renderBar({ pending: ["Pan"] });

    const button = usualsButton(3)!;
    expect(fireEvent.mouseDown(button)).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(items.insert).toHaveBeenCalledTimes(1));
    const rows = items.insert.mock.calls[0][0] as { name: string }[];
    expect(rows.map((row) => row.name)).toEqual(["Arroz", "Leche", "Tomates"]);
    expect(rows).toEqual([
      expect.objectContaining({ category_id: null, estimated_price: null }),
      expect.objectContaining({ category_id: DAIRY, estimated_price: 45 }),
      // Tomates is priced per kilo and comes with no unit: no price, rather
      // than $ 90 read per unit.
      expect.objectContaining({
        category_id: VEGETABLES,
        estimated_price: null,
      }),
    ]);
    expect(field).toHaveFocus();

    // The notice, in the bar and read by the live region.
    await waitFor(() =>
      expect(banner()).toHaveTextContent(texts.addItem.usuals.added(3)),
    );
    expect(
      document.querySelector('[data-slot="add-announcement"]'),
    ).toHaveTextContent(texts.addItem.usuals.added(3));
    // They are pending now: the button and their chips are gone.
    await waitFor(() => expect(usualsButton(3)).toBeNull());
  });

  it("Deshacer takes them back in one write, with the added ids", async () => {
    await renderBar();
    fireEvent.click(usualsButton(4)!);
    await waitFor(() => expect(items.insert).toHaveBeenCalledTimes(1));
    const added = (
      items.insert.mock.calls[0][0] as { id: string; name: string }[]
    ).map((row) => row.id);

    const undo = await screen.findByRole("button", {
      name: texts.addItem.usuals.undo,
    });
    expect(fireEvent.mouseDown(undo)).toBe(false);
    fireEvent.click(undo);

    await waitFor(() => expect(items.update).toHaveBeenCalledTimes(1));
    const [changes, filters] = items.update.mock.calls[0] as [
      unknown,
      [string, unknown][],
    ];
    expect(changes).toEqual({ deleted_at: expect.any(String) });
    expect(filters).toContainEqual(["id", expect.arrayContaining(added)]);
    expect(
      (filters.find(([column]) => column === "id")![1] as string[]).length,
    ).toBe(4);
    await waitFor(() => expect(banner()).toBeNull());
    // Nothing failed.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes away on its own after 8 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderBar();
      fireEvent.click(usualsButton(4)!);
      await waitFor(() =>
        expect(banner()).toHaveTextContent(texts.addItem.usuals.added(4)),
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(7900);
      });
      expect(banner()).toHaveTextContent(texts.addItem.usuals.added(4));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await waitFor(() => expect(banner()).toBeNull());
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells a rejected add of several, instead of the notice that it added them", async () => {
    write.mockResolvedValue(rejection);
    await renderBar();

    fireEvent.click(usualsButton(4)!);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(texts.itemErrors.addMany(4));
    expect(alert).toHaveTextContent(texts.itemErrors.addManyBody);
    expect(
      document.querySelector('[data-slot="banner"][data-tone="info"]'),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: texts.addItem.usuals.undo }),
    ).toBeNull();
  });

  it("tells a rejected undo with its own text", async () => {
    update.mockResolvedValue(rejection);
    await renderBar();
    fireEvent.click(usualsButton(4)!);
    await waitFor(() => expect(items.insert).toHaveBeenCalledTimes(1));

    fireEvent.click(
      await screen.findByRole("button", { name: texts.addItem.usuals.undo }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(texts.itemErrors.undoAdd);
    expect(alert).toHaveTextContent(texts.itemErrors.undoAddBody);
    expect(alert).not.toHaveTextContent("undefined");
  });
});

describe("notices of the writes of several", () => {
  it.each([
    [
      "add-many",
      { ids: ["a", "b", "c"], items: [{}, {}, {}] },
      texts.itemErrors.addMany(3),
      texts.itemErrors.addManyBody,
    ],
    [
      "undo-add",
      { ids: ["a", "b"], deletedAt: "2026-10-20T00:00:00.000Z" },
      texts.itemErrors.undoAdd,
      texts.itemErrors.undoAddBody,
    ],
  ])("shows a rejected %s", async (kind, variables, title, body) => {
    const { queryClient } = await renderBar();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: [...queryKeys.items(USER, LIST), kind],
      mutationFn: (): Promise<unknown> => Promise.reject(new Error("denied")),
    });
    await act(async () => {
      await mutation.execute(variables).catch(() => {});
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(body);
  });
});
