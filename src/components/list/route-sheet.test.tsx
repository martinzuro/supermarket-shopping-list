import { skipToken, useQuery } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeRpc,
  makeTestQueryClient,
  makeWrapper,
} from "@/lib/queries/test-utils";
import { moveCategory } from "@/lib/domain";
import { queryKeys } from "@/lib/queries/keys";
import type { Category } from "@/lib/queries";
import { texts } from "@/lib/texts";
import { ROUTE_DECLINED_KEY, RouteSheet } from "./route-sheet";
import { SIMPLE_LINE_KEY } from "./simple-line";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown; status?: number };

const callRpc = vi.fn<(name: string, args: unknown) => Promise<Result>>();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: makeRpc((name, args) => callRpc(name, args)),
  }),
}));

const t = texts.route;

function category(id: string, name: string, position: number): Category {
  return {
    id,
    list_id: LIST,
    name,
    position,
    is_default: true,
    created_at: "2026-10-20T10:00:00.000000+00:00",
    updated_at: "2026-10-20T10:00:00.000000+00:00",
    deleted_at: null,
  };
}

// The array is not in route order: the sheet follows `position`.
const ROUTE = [
  category("drinks", "Bebidas", 2),
  category("veg", "Frutas y verduras", 0),
  category("others", "Otros", 3),
  category("dairy", "Fiambres y lácteos", 1),
  { ...category("gone", "Panadería", 4), deleted_at: "2026-10-20T11:00:00Z" },
];
const COUNTS = new Map([
  ["veg", 3],
  ["dairy", 1],
]);

const key = queryKeys.categories(USER, LIST);

/** What ListView does: the cache feeds the sheet, which moves the route. */
function Harness({ open = true }: { open?: boolean }) {
  const { data } = useQuery<Category[]>({ queryKey: key, queryFn: skipToken });
  return (
    <RouteSheet
      open={open}
      onOpenChange={() => {}}
      userId={USER}
      listId={LIST}
      categories={data ?? []}
      counts={COUNTS}
    />
  );
}

/** Answers like the network: on a timer, so the optimistic order is seen. */
function later(result: Result, ms = 60) {
  return new Promise<Result>((resolve) =>
    setTimeout(() => resolve(result), ms),
  );
}

function renderRoute() {
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(key, ROUTE);
  render(<Harness />, { wrapper: makeWrapper(queryClient) });
  return { queryClient };
}

const rows = () => screen.getAllByRole("listitem");
const names = () =>
  rows().map((row) => row.querySelector(".text-row")?.textContent);
const button = (label: string) => screen.getByRole("button", { name: label });
const announcement = () =>
  document.querySelector('[data-slot="route-announcement"]')!;

beforeEach(() => {
  localStorage.clear();
  callRpc.mockReset();
  // A server that applies each move to the route it holds, and answers with
  // the whole route, as public.move_category does.
  let server: Category[] = ROUTE;
  callRpc.mockImplementation((_name, args) => {
    const move = args as {
      target_category_id: string;
      direction: "up" | "down";
      past_category_id: string;
    };
    server =
      moveCategory(
        server,
        move.target_category_id,
        move.direction,
        move.past_category_id,
      ) ?? server;
    return later({ data: server, error: null });
  });
});

describe("RouteSheet", () => {
  it("titles the sheet and lists every live category in route order", () => {
    renderRoute();
    expect(screen.getByRole("dialog")).toHaveAccessibleName(t.title);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      t.description,
    );
    expect(names()).toEqual([
      "Frutas y verduras",
      "Fiambres y lácteos",
      "Bebidas",
      "Otros",
    ]);
  });

  it("shows how many pending items a category holds, and nothing for none", () => {
    renderRoute();
    const counts = rows().map(
      (row) => row.querySelector("[data-numeric] [aria-hidden]")?.textContent,
    );
    expect(counts).toEqual(["3", "1", undefined, undefined]);
    expect(rows()[2].querySelector("[data-numeric]")).toBeNull();
    expect(screen.queryByText(t.pendingCount(0))).toBeNull();
    expect(within(rows()[0]).getByText(t.pendingCount(3))).toBeInTheDocument();
    expect(within(rows()[1]).getByText(t.pendingCount(1))).toBeInTheDocument();
  });

  it("names the arrows after their category", () => {
    renderRoute();
    expect(button(t.up("Bebidas"))).toBeInTheDocument();
    expect(button(t.down("Bebidas"))).toBeInTheDocument();
  });

  it("disables the arrows at the ends with aria-disabled, and does nothing there", () => {
    renderRoute();
    const first = button(t.up("Frutas y verduras"));
    const last = button(t.down("Otros"));
    for (const end of [first, last]) {
      expect(end).toHaveAttribute("aria-disabled", "true");
      expect(end).not.toBeDisabled();
    }
    expect(button(t.down("Frutas y verduras"))).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(button(t.up("Otros"))).not.toHaveAttribute("aria-disabled");

    fireEvent.click(first);
    fireEvent.click(last);
    expect(callRpc).not.toHaveBeenCalled();
    expect(names()[0]).toBe("Frutas y verduras");
    expect(announcement()).toHaveTextContent("");
  });

  it("sends the step past the neighbour and moves the row at once", async () => {
    renderRoute();
    fireEvent.click(button(t.up("Bebidas")));
    await waitFor(() =>
      expect(names()).toEqual([
        "Frutas y verduras",
        "Bebidas",
        "Fiambres y lácteos",
        "Otros",
      ]),
    );
    expect(callRpc).toHaveBeenCalledWith("move_category", {
      target_category_id: "drinks",
      direction: "up",
      past_category_id: "dairy",
    });

    fireEvent.click(button(t.down("Frutas y verduras")));
    await waitFor(() => expect(names()[0]).toBe("Bebidas"));
    // The writes go one after the other: the second leaves once the first
    // has been answered.
    await waitFor(() => expect(callRpc).toHaveBeenCalledTimes(2));
    expect(callRpc).toHaveBeenLastCalledWith("move_category", {
      target_category_id: "veg",
      direction: "down",
      past_category_id: "drinks",
    });
  });

  it("keeps the focus on the pressed button, on the same category in its new place", async () => {
    renderRoute();
    const down = button(t.down("Frutas y verduras"));
    down.focus();
    fireEvent.click(down);
    // What a browser does when React moves the node that had the focus.
    down.blur();
    expect(document.body).toHaveFocus();
    await waitFor(() => expect(names()[1]).toBe("Frutas y verduras"));
    expect(button(t.down("Frutas y verduras"))).toHaveFocus();

    // Again, now going up, from the other button of the row.
    const up = button(t.up("Frutas y verduras"));
    up.focus();
    fireEvent.click(up);
    up.blur();
    await waitFor(() => expect(names()[0]).toBe("Frutas y verduras"));
    expect(button(t.up("Frutas y verduras"))).toHaveFocus();
    // The first place: the arrow it was just pressed on is now at an end and
    // keeps the focus (aria-disabled, not disabled).
    expect(button(t.up("Frutas y verduras"))).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("does not take the focus from somewhere else it has moved to", async () => {
    renderRoute();
    fireEvent.click(button(t.down("Frutas y verduras")));
    const other = button(t.up("Otros"));
    other.focus();
    await waitFor(() => expect(names()[1]).toBe("Frutas y verduras"));
    expect(other).toHaveFocus();
  });

  it("says where the category landed, in a polite region that is always there", async () => {
    renderRoute();
    expect(announcement()).toHaveAttribute("aria-live", "polite");
    expect(announcement()).toHaveAttribute("role", "status");
    expect(announcement()).toHaveTextContent("");

    fireEvent.click(button(t.up("Bebidas")));
    await waitFor(() =>
      expect(announcement()).toHaveTextContent(t.position("Bebidas", 2, 4)),
    );
    fireEvent.click(button(t.up("Bebidas")));
    await waitFor(() =>
      expect(announcement()).toHaveTextContent(t.position("Bebidas", 1, 4)),
    );
  });

  it("tells a rejected move, puts the category back and lets the notice go", async () => {
    callRpc.mockImplementation(() =>
      later({
        data: null,
        error: { message: "category_not_found", code: "P0001" },
      }),
    );
    renderRoute();
    fireEvent.click(button(t.up("Bebidas")));
    await waitFor(() => expect(names()[1]).toBe("Bebidas"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.error.title("Bebidas"));
    expect(alert).toHaveTextContent(t.error.body);
    await waitFor(() => expect(names()[2]).toBe("Bebidas"));

    fireEvent.click(
      within(alert).getByRole("button", { name: texts.itemErrors.dismiss }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("does not show a rejection from before it was opened", async () => {
    callRpc.mockImplementation(() =>
      later({ data: null, error: { message: "nope", code: "P0001" } }, 5),
    );
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(key, ROUTE);
    const wrapper = makeWrapper(queryClient);
    const view = render(<Harness />, { wrapper });
    fireEvent.click(button(t.up("Bebidas")));
    await screen.findByRole("alert");

    view.rerender(<Harness open={false} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    view.rerender(<Harness />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes back to the arrow the user is on, not to the one last pressed", async () => {
    const { queryClient } = renderRoute();
    const down = button(t.down("Frutas y verduras"));
    down.focus();
    fireEvent.click(down);
    await waitFor(() => expect(names()[1]).toBe("Frutas y verduras"));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    // The user tabs on to another arrow; then another member moves that
    // category, the focus drops to <body> with the node that had it.
    button(t.up("Otros")).focus();
    const current = queryClient.getQueryData<Category[]>(key)!;
    act(() => {
      (document.activeElement as HTMLElement).blur();
      queryClient.setQueryData(
        key,
        moveCategory(current, "others", "up", "drinks"),
      );
    });
    await waitFor(() => expect(names()[2]).toBe("Otros"));
    expect(button(t.up("Otros"))).toHaveFocus();
  });

  it("says the position once, and not again when another member shifts the category", async () => {
    const { queryClient } = renderRoute();
    fireEvent.click(button(t.up("Bebidas")));
    await waitFor(() =>
      expect(announcement()).toHaveTextContent(t.position("Bebidas", 2, 4)),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    // Another member moves Frutas y verduras past Bebidas: Bebidas is now
    // first, which is not something the user did.
    const current = queryClient.getQueryData<Category[]>(key)!;
    act(() => {
      queryClient.setQueryData(
        key,
        moveCategory(current, "veg", "down", "drinks"),
      );
    });
    await waitFor(() => expect(names()[0]).toBe("Bebidas"));
    expect(announcement()).toHaveTextContent(t.position("Bebidas", 2, 4));

    // The next move of the user is said again.
    fireEvent.click(button(t.up("Otros")));
    await waitFor(() =>
      expect(announcement()).toHaveTextContent(t.position("Otros", 3, 4)),
    );
  });

  it("forgets the rejections it showed, when they are dismissed and when it closes", async () => {
    callRpc.mockImplementation(() =>
      later({ data: null, error: { message: "nope", code: "P0001" } }, 5),
    );
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(key, ROUTE);
    const view = render(<Harness />, { wrapper: makeWrapper(queryClient) });
    const failed = () =>
      queryClient.getMutationCache().findAll({ status: "error" }).length;

    fireEvent.click(button(t.up("Bebidas")));
    const alert = await screen.findByRole("alert");
    expect(failed()).toBe(1);
    fireEvent.click(
      within(alert).getByRole("button", { name: texts.itemErrors.dismiss }),
    );
    await waitFor(() => expect(failed()).toBe(0));

    // Not dismissed, closed: it is the sheet's notice, not the add bar's.
    fireEvent.click(button(t.up("Bebidas")));
    await waitFor(() => expect(failed()).toBe(1));
    view.rerender(<Harness open={false} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(failed()).toBe(0);
  });

  describe("the order learned from past trips (F-9)", () => {
    /** A trip that checked one product per category, in this order. */
    const trip = (id: string, order: string[]) => ({
      id,
      emptied_at: "2026-11-01T10:00:00Z",
      items: order.map((categoryId, minute) => ({
        category_id: categoryId,
        checked_at: `2026-11-01T09:${String(10 + minute)}:00Z`,
      })),
    });
    const LEARNED = ["dairy", "drinks", "veg", "others"];

    function renderWithTrips(trips: unknown[]) {
      const queryClient = makeTestQueryClient();
      queryClient.setQueryData(key, ROUTE);
      queryClient.setQueryData(queryKeys.trips(USER, LIST), {
        trips,
        more: false,
      });
      render(<Harness />, { wrapper: makeWrapper(queryClient) });
    }
    const suggestion = () => screen.queryByText(t.suggestion.title);

    it("is not offered without enough trips", () => {
      renderWithTrips([trip("one", LEARNED)]);
      expect(suggestion()).toBeNull();
    });

    it("is not offered when the trips follow the route", () => {
      const route = ["veg", "dairy", "drinks", "others"];
      renderWithTrips([trip("one", route), trip("two", route)]);
      expect(suggestion()).toBeNull();
    });

    it("is offered when it differs, and using it writes the route", async () => {
      renderWithTrips([trip("one", LEARNED), trip("two", LEARNED)]);
      expect(suggestion()).toBeInTheDocument();
      expect(
        screen.getByText(
          t.suggestion.body(2, [
            "Fiambres y lácteos",
            "Bebidas",
            "Frutas y verduras",
            "Otros",
          ]),
        ),
      ).toBeInTheDocument();

      fireEvent.click(button(t.suggestion.use));
      // At once, before any answer.
      await waitFor(() =>
        expect(names()).toEqual([
          "Fiambres y lácteos",
          "Bebidas",
          "Frutas y verduras",
          "Otros",
        ]),
      );
      expect(announcement()).toHaveTextContent(t.suggestion.used);
      await waitFor(() => expect(suggestion()).toBeNull());
      // One move per category out of place, each up to right before another.
      await waitFor(() => expect(callRpc).toHaveBeenCalledTimes(2));
      expect(callRpc.mock.calls.map(([, args]) => args)).toEqual([
        {
          target_category_id: "dairy",
          direction: "up",
          past_category_id: "veg",
        },
        {
          target_category_id: "drinks",
          direction: "up",
          past_category_id: "veg",
        },
      ]);
      // The answers leave the route as it was put.
      await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
      expect(names()).toEqual([
        "Fiambres y lácteos",
        "Bebidas",
        "Frutas y verduras",
        "Otros",
      ]);
    });

    it("is not offered when only categories no trip saw are out of its order", () => {
      // The trips skip "Fiambres y lácteos", second in the route: it keeps
      // its place, and the rest already follow the trips.
      const seen = ["veg", "drinks", "others"];
      renderWithTrips([trip("one", seen), trip("two", seen)]);
      expect(suggestion()).toBeNull();
    });

    it("leaves in its place a category no trip saw", async () => {
      const seen = ["drinks", "veg", "others"];
      renderWithTrips([trip("one", seen), trip("two", seen)]);
      fireEvent.click(button(t.suggestion.use));
      await waitFor(() =>
        expect(names()).toEqual([
          "Bebidas",
          "Fiambres y lácteos",
          "Frutas y verduras",
          "Otros",
        ]),
      );
      // One move, and its answer in before the next test.
      await waitFor(() => expect(callRpc).toHaveBeenCalledTimes(1));
      await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    });

    it("goes away with Ahora no, and the route stays", async () => {
      renderWithTrips([trip("one", LEARNED), trip("two", LEARNED)]);
      fireEvent.click(button(t.suggestion.later));
      await waitFor(() => expect(suggestion()).toBeNull());
      expect(callRpc).not.toHaveBeenCalled();
      expect(names()[0]).toBe("Frutas y verduras");
      // Remembered on this device for this order: not asked again.
      expect(localStorage.getItem(ROUTE_DECLINED_KEY)).toBe(
        `${LIST}:${LEARNED.join()}`,
      );
      cleanup();
      renderWithTrips([trip("one", LEARNED), trip("two", LEARNED)]);
      expect(suggestion()).toBeNull();
    });
  });

  describe("shopping without categories (F-9)", () => {
    it("is a switch of this device, off until turned on", () => {
      localStorage.clear();
      renderRoute();
      const toggle = screen.getByRole("switch", { name: t.simple.title });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(toggle).toHaveAccessibleDescription(t.simple.description);
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(localStorage.getItem(SIMPLE_LINE_KEY)).toBe("1");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(localStorage.getItem(SIMPLE_LINE_KEY)).toBeNull();
    });
  });
});
