import { skipToken, useQuery } from "@tanstack/react-query";
import {
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
import { RouteSheet } from "./route-sheet";

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

  it("shows how many pending items each category holds, empty ones too", () => {
    renderRoute();
    const counts = rows().map(
      (row) => row.querySelector("[data-numeric] [aria-hidden]")?.textContent,
    );
    expect(counts).toEqual(["3", "1", "0", "0"]);
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
});
