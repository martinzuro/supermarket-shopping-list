import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "@/lib/queries/test-utils";
import { queryKeys } from "@/lib/queries/keys";
import type { Category, Item } from "@/lib/queries";
import { texts } from "@/lib/texts";
import { AddItemBar } from "./add-item-bar";
import { SendPending } from "./send-pending";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

const lists = makeTable({
  read: async () => ({ data: [{ id: LIST, name: "Mi lista" }], error: null }),
  write: async () => ({ data: null, error: null }),
});
const items = makeTable({
  read: async () => ({ data: [], error: null }),
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

const t = texts.sendPending;
const VEGETABLES = "00000000-0000-7000-8000-0000000000c1";
const OTHERS = "00000000-0000-7000-8000-0000000000c9";

function category(id: string, name: string, position: number): Category {
  return {
    id,
    list_id: LIST,
    name,
    position,
    is_default: true,
    created_at: "",
    updated_at: "",
    deleted_at: null,
  };
}

const CATEGORIES = [
  category(OTHERS, "Otros", 9),
  category(VEGETABLES, "Frutas y verduras", 0),
];

function item(
  name: string,
  position: number,
  overrides: Partial<Item> = {},
): Item {
  return {
    id: `item-${position}`,
    list_id: LIST,
    name,
    name_normalized: name.toLowerCase(),
    category_id: null,
    checked: false,
    checked_at: null,
    created_at: "",
    created_by: USER,
    currency: null,
    deleted_at: null,
    trip_id: null,
    estimated_price: null,
    note: null,
    position,
    quantity: null,
    unit: null,
    updated_at: "",
    ...overrides,
  };
}

const ITEMS = [
  item("Leche", 1, { quantity: 3, note: "descremada" }),
  item("Tomates", 2, { quantity: 2, unit: "kg", category_id: VEGETABLES }),
  item("Pan", 3, { checked: true }),
];

// What goes out: the cart (Pan) stays out, the route puts Otros last.
const TEXT = [
  "Lo que falta:",
  "",
  "*Frutas y verduras:*",
  "- Tomates 2 kg",
  "",
  "*Otros:*",
  "- Leche ×3 — _descremada_",
].join("\n");

const share = vi.fn<(data: ShareData) => Promise<void>>();
const writeText = vi.fn<(text: string) => Promise<void>>();

function withWebShare(available: boolean) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: available ? share : undefined,
  });
}

function renderScreen({
  items = ITEMS,
  queryClient = makeTestQueryClient(),
  bar = true,
} = {}) {
  queryClient.setQueryData(queryKeys.lists(USER), [
    { id: LIST, name: "Mi lista" },
  ]);
  queryClient.setQueryData(queryKeys.items(USER, LIST), items);
  queryClient.setQueryData(queryKeys.categories(USER, LIST), CATEGORIES);
  queryClient.setQueryData(queryKeys.catalog(USER, LIST), []);
  // The header of Pendientes and the add bar, as the list page has them.
  return render(
    <>
      <SendPending items={items} categories={CATEGORIES} />
      {bar ? <AddItemBar /> : null}
    </>,
    { wrapper: makeWrapper(queryClient) },
  );
}

function copiedNotice() {
  return screen.queryByText(t.copied);
}

function announcement() {
  return document.querySelector('[data-slot="add-announcement"]');
}

beforeEach(() => {
  share.mockReset();
  share.mockResolvedValue(undefined);
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  withWebShare(false);
});

describe("SendPending", () => {
  it("hands what is pending to the share sheet, as a message", async () => {
    withWebShare(true);
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: t.share }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: TEXT }));
    expect(writeText).not.toHaveBeenCalled();
    // The share sheet of the system said it all: nothing in the bar.
    await act(async () => {});
    expect(copiedNotice()).toBeNull();
  });

  it("copies where the browser cannot share, and the bar says so", async () => {
    withWebShare(false);
    renderScreen();

    expect(screen.queryByRole("button", { name: t.share })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.copy }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
    await waitFor(() => expect(copiedNotice()).toBeInTheDocument());
    expect(screen.getByText(t.copiedBody)).toBeInTheDocument();
    expect(announcement()).toHaveTextContent(`${t.copied} ${t.copiedBody}`);

    // It closes on its own button, and stays closed.
    const banner = copiedNotice()!.closest('[data-slot="banner"]');
    fireEvent.click(
      within(banner as HTMLElement).getByRole("button", {
        name: texts.itemErrors.dismiss,
      }),
    );
    await waitFor(() => expect(copiedNotice()).toBeNull());
    expect(announcement()).toHaveTextContent("");
  });

  it("says nothing when the person closes the share sheet", async () => {
    withWebShare(true);
    share.mockRejectedValue(new DOMException("closed", "AbortError"));
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: t.share }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(writeText).not.toHaveBeenCalled();
    expect(copiedNotice()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("copies when sharing fails for another reason", async () => {
    withWebShare(true);
    share.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: t.share }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
    await waitFor(() => expect(copiedNotice()).toBeInTheDocument());
  });

  it("offers the text, selected, when not even the copy works", async () => {
    withWebShare(false);
    writeText.mockRejectedValue(new Error("denied"));
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: t.copy }));

    const sheet = await screen.findByRole("dialog", { name: t.manual.title });
    expect(within(sheet).getByText(t.manual.description)).toBeInTheDocument();
    const text = sheet.querySelector('[data-slot="pending-text"]');
    expect(text?.textContent).toBe(TEXT);
    await waitFor(() => expect(window.getSelection()?.toString()).toBe(TEXT));
    expect(copiedNotice()).toBeNull();
  });

  it("shares once while the share sheet is up", async () => {
    withWebShare(true);
    share.mockReturnValue(new Promise(() => {}));
    renderScreen();

    const button = screen.getByRole("button", { name: t.share });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shares again once the share sheet is gone", async () => {
    withWebShare(true);
    renderScreen();

    const button = screen.getByRole("button", { name: t.share });
    fireEvent.click(button);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await act(async () => {});
    fireEvent.click(button);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
  });

  it("is not there while nothing is pending", () => {
    withWebShare(true);
    // Pan is in the cart; Leche was just checked.
    renderScreen({
      items: [ITEMS[2], { ...ITEMS[0], checked: true }],
    });

    expect(screen.queryByRole("button", { name: t.share })).toBeNull();
  });

  it("takes the place of the notice it covers, which does not come back", async () => {
    withWebShare(false);
    renderScreen();
    const field = screen.getByRole<HTMLInputElement>("combobox", {
      name: texts.addItem.label,
    });

    // Leche is pending: the bar says so instead of adding it again.
    fireEvent.change(field, { target: { value: "Leche" } });
    fireEvent.submit(field.form!);
    const duplicate = texts.addItem.duplicate.title("Leche");
    await waitFor(() =>
      expect(screen.getByText(duplicate)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: t.copy }));
    await waitFor(() => expect(copiedNotice()).toBeInTheDocument());
    expect(screen.queryByText(duplicate)).toBeNull();

    const banner = copiedNotice()!.closest('[data-slot="banner"]');
    fireEvent.click(
      within(banner as HTMLElement).getByRole("button", {
        name: texts.itemErrors.dismiss,
      }),
    );
    await waitFor(() => expect(copiedNotice()).toBeNull());
    await act(async () => {});
    expect(screen.queryByText(duplicate)).toBeNull();
  });

  it("is old news for a bar that comes after the copy", async () => {
    withWebShare(false);
    const queryClient = makeTestQueryClient();
    const first = renderScreen({ queryClient, bar: false });
    fireEvent.click(screen.getByRole("button", { name: t.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    first.unmount();

    // Back from another page: the list and its bar mount again.
    renderScreen({ queryClient });
    await act(async () => {});
    expect(copiedNotice()).toBeNull();
  });
});
