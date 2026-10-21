import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddItemBar } from "@/components/list/add-item-bar";
import { formatMoney, formatTripDate } from "@/lib/domain";
import { TRIP_LIMIT } from "@/lib/queries";
import { queryKeys } from "@/lib/queries/keys";
import {
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "@/lib/queries/test-utils";
import { texts } from "@/lib/texts";
import { AppMenu } from "./app-menu";

/**
 * "Compras anteriores" in the menu (docs/improvements.md, F-4): the list of
 * past trips, and adding one again through the review sheet, with the add
 * bar's notice. The menu and the bar are the real ones; the account and the
 * saved products, which have their own tests, are left out.
 */

vi.mock("@/components/menu/account-section", () => ({
  AccountSection: () => null,
}));
vi.mock("@/components/menu/products-section", () => ({
  ProductsSection: () => null,
}));
vi.mock("@/components/session-provider", () => ({
  useSession: () => ({ status: "ready", user: { id: USER } }),
}));

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";
const VEGETABLES = "00000000-0000-7000-8000-0000000000c1";
const DAIRY = "00000000-0000-7000-8000-0000000000c2";
const t = texts.trips;

type Result = { data: unknown; error: unknown; status?: number };

const readTrips = vi.fn<() => Promise<Result>>();
const trips = makeTable({
  read: readTrips,
  write: () => Promise.reject(new Error("only empty_cart makes trips")),
});
const write = vi.fn<(row: unknown) => Promise<Result>>();
const items = makeTable({
  read: async () => ({ data: pending(), error: null }),
  write,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) =>
      table === "trips" ? trips.builder() : items.builder(),
  }),
}));

/** An instant at this local time, whatever the machine's time zone. */
const local = (month: number, day: number, hours: number, minutes = 0) =>
  new Date(2026, month - 1, day, hours, minutes).toISOString();

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

function entry(display_name: string, extra: Record<string, unknown> = {}) {
  return {
    name_normalized: display_name.toLowerCase(),
    display_name,
    last_category_id: null,
    last_unit: null,
    last_price: null,
    last_currency: null,
    last_quantity: null,
    last_quantity_unit: null,
    times_added: 3,
    last_added_at: local(10, 20, 18),
    ...extra,
  };
}

function row(name: string, extra: Record<string, unknown> = {}) {
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
    created_at: local(10, 20, 9),
    updated_at: local(10, 20, 9),
    deleted_at: null,
    trip_id: null,
    ...extra,
  };
}

/** A row of a trip: through the checkout, archived when the cart emptied. */
function bought(tripId: string, name: string, extra = {}) {
  return row(name, {
    id: `${tripId}-${name}`,
    checked: true,
    deleted_at: local(10, 20, 18, 40),
    trip_id: tripId,
    ...extra,
  });
}

const CATEGORIES = [
  category(VEGETABLES, "Frutas y verduras", 0),
  category(DAIRY, "Fiambres y lácteos", 2),
];

// What the catalog remembers decides the category and the price of a
// product added again, as for any add: Tomates per kilo, Leche per unit.
const CATALOG = [
  entry("Tomates", {
    last_category_id: VEGETABLES,
    last_unit: "kg",
    last_price: 90,
    last_currency: "UYU",
  }),
  entry("Leche", {
    last_category_id: DAIRY,
    last_price: 45,
    last_currency: "UYU",
  }),
  entry("Pan"),
];

const LAST = {
  id: "trip-last",
  emptied_at: local(10, 20, 18, 40),
  items: [
    bought("trip-last", "Leche", {
      quantity: 3,
      estimated_price: 45,
      category_id: DAIRY,
    }),
    bought("trip-last", "Tomates", {
      position: 1,
      quantity: 2,
      unit: "kg",
      estimated_price: 90,
      // Otros back then; the catalog has learned better since.
      category_id: null,
    }),
    bought("trip-last", "Pan", { position: 2 }),
    // Not in the catalog any more (forgotten): no category, no price.
    bought("trip-last", "Yerba", { position: 3, estimated_price: 200 }),
  ],
};
const MORNING = {
  id: "trip-morning",
  emptied_at: local(10, 20, 9, 15),
  items: [
    bought("trip-morning", "Vino", { estimated_price: 12, currency: "USD" }),
  ],
};
const OLDER = {
  id: "trip-older",
  emptied_at: local(10, 14, 19),
  items: [bought("trip-older", "Arroz")],
};

/**
 * The day of a trip as the history names it, today (domain tests cover the
 * wording): with the year, once these 2026 trips are last year's.
 */
const day = (instant: string) => formatTripDate(instant, new Date());

let onList: ReturnType<typeof row>[] = [];
const pending = () => onList;

function renderMenu(history: unknown[] = [LAST, MORNING, OLDER]) {
  readTrips.mockImplementation(async () => ({ data: history, error: null }));
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(queryKeys.lists(USER), [
    { id: LIST, name: "Mi lista" },
  ]);
  queryClient.setQueryData(queryKeys.items(USER, LIST), onList);
  queryClient.setQueryData(queryKeys.categories(USER, LIST), CATEGORIES);
  queryClient.setQueryData(queryKeys.catalog(USER, LIST), CATALOG);
  render(
    <>
      <AppMenu pendingSignIn={null} onPendingSignInChange={() => {}} />
      <AddItemBar />
    </>,
    { wrapper: makeWrapper(queryClient) },
  );
  return { queryClient };
}

const menuButton = () =>
  screen.getByRole("button", { name: texts.header.menu });
const menu = () => screen.queryByRole("dialog", { name: texts.menu.title });
const review = (name: string) => screen.queryByRole("dialog", { name });
/** The review opens once the menu has gone: it takes the menu's exit. */
const reviewOpens = (name: string) =>
  screen.findByRole("dialog", { name }, { timeout: 3000 });
const tripRows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-slot="trip-row"]'));
const banner = () => document.querySelector('[data-slot="banner"]');

async function openMenu() {
  fireEvent.click(menuButton());
  await waitFor(() => expect(tripRows().length).toBeGreaterThan(0));
}

/** How many dialogs are ever on the page at once, while `run` goes on. */
function watchDialogs() {
  let most = 0;
  const count = () => {
    most = Math.max(most, document.querySelectorAll('[role="dialog"]').length);
  };
  const observer = new MutationObserver(count);
  observer.observe(document.body, { childList: true, subtree: true });
  count();
  return {
    most: () => most,
    stop: () => observer.disconnect(),
  };
}

beforeEach(() => {
  onList = [row("Leche")];
  readTrips.mockReset();
  write.mockReset();
  write.mockImplementation(async (payload) => ({
    data: (payload as Record<string, unknown>[]).map((one) =>
      row(String(one.name), one),
    ),
    error: null,
  }));
  items.insert.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Compras anteriores", () => {
  it("lists the trips newest first, with how many products and what they came to", async () => {
    renderMenu();
    await openMenu();

    const section = screen.getByRole("region", { name: t.title });
    const rows = within(section).getAllByRole("button");
    // Two on the 20th: their time tells them apart.
    const last = t.at(day(LAST.emptied_at), "18:40");
    const morning = t.at(day(LAST.emptied_at), "09:15");
    expect(rows.map((one) => one.getAttribute("aria-label"))).toEqual([
      // Leche 3 × 45, Tomates 2 kg × 90; Pan without price. Yerba is counted
      // at what it cost then, even forgotten by the catalog.
      t.label(last, t.count(4), [formatMoney(515, "UYU")]),
      t.label(morning, t.count(1), [formatMoney(12, "USD")]),
      t.label(day(OLDER.emptied_at), t.count(1), []),
    ]);
    for (const one of rows) {
      expect(one).toHaveAttribute("aria-haspopup", "dialog");
    }
    expect(rows[0]).toHaveTextContent(last);
    // The amount as formatMoney spells it (a non-breaking space after "$").
    expect(rows[0].textContent).toContain(
      `${t.count(4)} · ${formatMoney(515, "UYU")}`,
    );
  });

  it("says when it could not read them, and reads them again", async () => {
    renderMenu();
    readTrips.mockImplementation(async () => ({
      data: null,
      error: { message: "upstream timeout", code: "" },
      status: 503,
    }));
    fireEvent.click(menuButton());
    const section = await screen.findByRole("region", { name: t.title });
    await waitFor(() => expect(section).toHaveTextContent(t.errors.load));

    readTrips.mockImplementation(async () => ({ data: [LAST], error: null }));
    fireEvent.click(
      within(section).getByRole("button", { name: t.errors.retry }),
    );
    await waitFor(() => expect(tripRows()).toHaveLength(1));
  });

  it(`says so when there are more than the last ${TRIP_LIMIT}`, async () => {
    const many = Array.from({ length: TRIP_LIMIT }, (_, n) => ({
      ...OLDER,
      id: `trip-${n}`,
      emptied_at: local(9, 1 + n, 19),
    }));
    renderMenu(many);
    readTrips.mockImplementation(async () => ({
      data: [...many, OLDER],
      error: null,
    }));
    await openMenu();

    expect(tripRows()).toHaveLength(TRIP_LIMIT);
    expect(screen.getByRole("region", { name: t.title })).toHaveTextContent(
      t.more(TRIP_LIMIT),
    );
  });

  it("says where the trips will be while there is none", async () => {
    renderMenu([]);
    fireEvent.click(menuButton());

    const section = await waitFor(() =>
      screen.getByRole("region", { name: t.title }),
    );
    await waitFor(() => expect(section).toHaveTextContent(t.empty));
    expect(tripRows()).toEqual([]);
  });

  it("closes the menu before the trip opens: never two sheets at once", async () => {
    renderMenu();
    await openMenu();
    const dialogs = watchDialogs();

    fireEvent.click(tripRows()[0]);

    const sheet = await reviewOpens(t.at(day(LAST.emptied_at), "18:40"));
    dialogs.stop();
    expect(dialogs.most()).toBe(1);
    expect(menu()).toBeNull();
    // In route order, by where each would land now: Tomates in Frutas y
    // verduras, Leche in Fiambres y lácteos, the rest without category.
    expect(
      within(sheet)
        .getAllByRole("listitem")
        .map((one) => one.textContent),
    ).toEqual([
      "Tomates 2 kg",
      `Leche 3 ${texts.addItem.review.inList}`,
      "Pan",
      "Yerba",
    ]);
    // Leche is pending already: shown, not offered.
    expect(
      within(sheet)
        .getAllByRole("checkbox")
        .map((one) => one.getAttribute("aria-checked")),
    ).toEqual(["true", "true", "true"]);
    expect(
      within(sheet).getByRole("button", { name: texts.addItem.review.add(3) }),
    ).toBeEnabled();
  });

  it("adds again what stays ticked, in one write, and the bar says so", async () => {
    renderMenu();
    await openMenu();
    fireEvent.click(tripRows()[0]);
    const sheet = await reviewOpens(t.at(day(LAST.emptied_at), "18:40"));

    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Pan" }));
    const add = within(sheet).getByRole("button", {
      name: texts.addItem.review.add(2),
    });
    // A second tap while the sheet leaves is not a second add.
    fireEvent.click(add);
    fireEvent.click(add);

    await waitFor(() => expect(items.insert).toHaveBeenCalledTimes(1));
    expect(items.insert.mock.calls[0][0]).toEqual([
      // Its quantity, and the catalog's category and price per kilo.
      expect.objectContaining({
        name: "Tomates",
        quantity: 2,
        unit: "kg",
        category_id: VEGETABLES,
        estimated_price: 90,
      }),
      // Forgotten by the catalog: as any new product, no category or price.
      expect.objectContaining({
        name: "Yerba",
        quantity: null,
        category_id: null,
        estimated_price: null,
      }),
    ]);
    await waitFor(() =>
      expect(review(t.at(day(LAST.emptied_at), "18:40"))).toBeNull(),
    );
    await waitFor(() =>
      expect(banner()).toHaveTextContent(texts.addItem.usuals.added(2)),
    );
    expect(
      within(banner() as HTMLElement).getByRole("button", {
        name: texts.addItem.usuals.undo,
      }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="add-announcement"]'),
    ).toHaveTextContent(texts.addItem.usuals.added(2));
    // Back where the user went from; the menu stays closed.
    expect(menuButton()).toHaveFocus();
    expect(menu()).toBeNull();
    // The second tap added nothing.
    expect(items.insert).toHaveBeenCalledTimes(1);
  });

  it("takes the place of the notice it covers, which does not come back", async () => {
    renderMenu();
    // Leche is pending: typing it again leaves "ya está en la lista".
    const field = screen.getByRole<HTMLInputElement>("combobox", {
      name: texts.addItem.label,
    });
    fireEvent.change(field, { target: { value: "Leche" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() =>
      expect(banner()).toHaveTextContent(
        texts.addItem.duplicate.title("Leche"),
      ),
    );

    await openMenu();
    fireEvent.click(tripRows()[0]);
    const sheet = await reviewOpens(t.at(day(LAST.emptied_at), "18:40"));
    fireEvent.click(
      within(sheet).getByRole("button", { name: texts.addItem.review.add(3) }),
    );
    await waitFor(() =>
      expect(banner()).toHaveTextContent(texts.addItem.usuals.added(3)),
    );

    // Closed (here by its Deshacer), the bar is clear: the older notice it
    // covered is not news any more.
    write.mockClear();
    fireEvent.click(
      within(banner() as HTMLElement).getByRole("button", {
        name: texts.addItem.usuals.undo,
      }),
    );
    await waitFor(() => expect(banner()).toBeNull());
  });

  it("closed without adding, goes back to the menu, on that trip", async () => {
    renderMenu();
    await openMenu();
    fireEvent.click(tripRows()[1]);
    const name = t.at(day(LAST.emptied_at), "09:15");
    const sheet = await reviewOpens(name);

    fireEvent.keyDown(sheet, { key: "Escape" });

    await waitFor(() => expect(menu()).not.toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        "data-trip-id",
        MORNING.id,
      ),
    );
    expect(review(name)).toBeNull();
    expect(items.insert).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });
});
