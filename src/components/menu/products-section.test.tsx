import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "@/lib/queries/test-utils";
import { queryKeys } from "@/lib/queries/keys";
import { texts } from "@/lib/texts";
import { ProductsSection } from "./products-section";

/** "Productos guardados" in the menu (docs/improvements.md, M-5). */

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";
const DAIRY = "00000000-0000-7000-8000-0000000000c2";
const t = texts.products;

type Result = { data: unknown; error: unknown; status?: number };

const remove = vi.fn<(filters: [string, unknown][]) => Promise<Result>>();
const read = vi.fn<() => Promise<Result>>();
const catalog = makeTable({
  read,
  write: () => Promise.reject(new Error("only the triggers write it")),
  remove,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => catalog.builder() }),
}));

vi.mock("@/components/session-provider", () => ({
  useSession: () => ({ status: "ready", user: { id: USER } }),
}));

function entry(
  display_name: string,
  times_added: number,
  last_category_id: string | null = null,
) {
  return {
    name_normalized: display_name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""),
    display_name,
    last_category_id,
    last_unit: null,
    last_price: null,
    last_currency: null,
    last_quantity: null,
    last_quantity_unit: null,
    times_added,
    last_added_at: "2026-10-21T10:00:00+00:00",
  };
}

const CATALOG = [
  entry("Yerba", 2),
  entry("Leche descremada", 1, DAIRY),
  entry("Tomatse", 1),
  entry("Tomates", 4),
  entry("Café", 3),
];

function renderSection(entries: unknown[] = CATALOG) {
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(queryKeys.lists(USER), [
    { id: LIST, name: "Mi lista" },
  ]);
  queryClient.setQueryData(queryKeys.categories(USER, LIST), [
    {
      id: DAIRY,
      list_id: LIST,
      name: "Fiambres y lácteos",
      position: 2,
      is_default: true,
      created_at: "",
      updated_at: "",
      deleted_at: null,
    },
  ]);
  queryClient.setQueryData(queryKeys.catalog(USER, LIST), entries);
  render(<ProductsSection />, { wrapper: makeWrapper(queryClient) });
  return { queryClient };
}

const names = () =>
  screen
    .queryAllByRole("listitem")
    .map((row) => row.querySelector("p")?.textContent);
const forgetButton = (name: string) =>
  screen.getByRole("button", { name: t.forget.label(name) });
const confirmButton = (name: string) =>
  screen.queryByRole("button", { name: t.forget.confirmLabel(name) });
const search = () => screen.getByRole("textbox", { name: t.search });
/** Past the confirmation's guard against an accidental double tap. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 400));

beforeEach(() => {
  read.mockReset();
  read.mockReturnValue(new Promise(() => {}));
  remove.mockReset();
  catalog.remove.mockClear();
});

describe("Productos guardados", () => {
  it("lists what the catalog remembers in alphabetical order, with how often", () => {
    renderSection();

    expect(
      screen.getByRole("heading", { name: t.title, level: 2 }),
    ).toBeInTheDocument();
    expect(names()).toEqual([
      "Café",
      "Leche descremada",
      "Tomates",
      "Tomatse",
      "Yerba",
    ]);
    expect(screen.getByText(t.times(4))).toBeInTheDocument();
    expect(screen.getAllByText(t.times(1))).toHaveLength(2);
  });

  it("finds by the start of the name or of a later word, accents aside", () => {
    renderSection();

    fireEvent.change(search(), { target: { value: "tomat" } });
    expect(names()).toEqual(["Tomates", "Tomatse"]);
    fireEvent.change(search(), { target: { value: "desc" } });
    expect(names()).toEqual(["Leche descremada"]);
    fireEvent.change(search(), { target: { value: "CAFE" } });
    expect(names()).toEqual(["Café"]);
    fireEvent.change(search(), { target: { value: "zzz" } });
    expect(names()).toEqual([]);
    expect(screen.getByText(t.none("zzz"))).toBeInTheDocument();
  });

  it("says when there is nothing remembered yet", () => {
    renderSection([]);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("forgets a product with the light confirmation: one tap asks, the next does it", async () => {
    remove.mockReturnValue(new Promise(() => {}));
    const { queryClient } = renderSection();

    fireEvent.click(forgetButton("Tomatse"));
    expect(confirmButton("Tomatse")).toHaveTextContent(t.forget.confirm);
    expect(screen.getByText(t.forget.consequence)).toBeInTheDocument();
    // Said once to the screen reader.
    expect(screen.getByRole("status")).toHaveTextContent(
      t.forget.confirmLabel("Tomatse"),
    );
    expect(catalog.remove).not.toHaveBeenCalled();

    await pause();
    fireEvent.click(confirmButton("Tomatse")!);

    await waitFor(() => expect(names()).not.toContain("Tomatse"));
    await waitFor(() =>
      expect(catalog.remove).toHaveBeenCalledWith([
        ["list_id", LIST],
        ["name_normalized", "tomatse"],
      ]),
    );
    expect(
      queryClient
        .getQueryData<{ name_normalized: string }[]>(
          queryKeys.catalog(USER, LIST),
        )
        ?.map((one) => one.name_normalized),
    ).not.toContain("tomatse");
  });

  it("takes a quick double tap as one tap: it only asks", async () => {
    renderSection();

    fireEvent.click(forgetButton("Tomatse"));
    fireEvent.click(confirmButton("Tomatse")!);

    await pause();
    expect(catalog.remove).not.toHaveBeenCalled();
    expect(names()).toContain("Tomatse");
  });

  it("brings it back and says so when the server rejects", async () => {
    remove.mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    renderSection();

    fireEvent.click(forgetButton("Tomatse"));
    await pause();
    fireEvent.click(confirmButton("Tomatse")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.errors.forget("Tomatse"),
    );
    expect(names()).toContain("Tomatse");
  });
});
