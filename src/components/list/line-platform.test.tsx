import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CHECKOUT } from "@/lib/domain";
import type { Category, Item } from "@/lib/queries";
import { texts } from "@/lib/texts";
import { LINE_HEADING_ID, LinePlatform } from "./line-platform";
import type { Line, Station } from "./use-line";

const t = texts.line;
const ME = "user-me";
const ANA = "user-ana";
const LIST = "list";
const NONE: ReadonlySet<string> = new Set();

const category = (id: string, name: string, position: number): Category => ({
  id,
  list_id: LIST,
  name,
  position,
  is_default: true,
  created_at: "",
  updated_at: "",
  deleted_at: null,
});

const BAKERY = category("bakery", "Panadería", 0);
const VEGETABLES = category("vegetables", "Frutas y verduras", 1);
const DAIRY = category("dairy", "Lácteos", 2);

const item = (
  name: string,
  { checked = false, by = ME }: { checked?: boolean; by?: string } = {},
): Item => ({
  id: `item-${name}`,
  list_id: LIST,
  name,
  name_normalized: name.toLowerCase(),
  quantity: null,
  unit: null,
  note: null,
  category_id: null,
  checked,
  checked_at: null,
  position: 0,
  estimated_price: null,
  currency: "UYU",
  created_at: "",
  updated_at: "",
  deleted_at: null,
  created_by: by,
  trip_id: null,
});

const station = (one: Category, items: Item[]): Station => ({
  id: one.id,
  category: one,
  items,
  pending: items.filter((each) => !each.checked).length,
});

/** A line as useLine gives it: what is behind follows from the position. */
function lineOf(
  stations: Station[],
  at: string,
  passed: string[],
  move = vi.fn(),
): Line {
  return {
    stations,
    position: { at, passed },
    here: stations.find((one) => one.id === at) ?? null,
    next: CHECKOUT,
    behind: new Map(
      stations
        .filter(
          (one) => one.id !== at && passed.includes(one.id) && one.pending > 0,
        )
        .map((one) => [one.id, one.pending]),
    ),
    move,
  };
}

function platform(line: Line, remote: ReadonlySet<string> = NONE) {
  return (
    <LinePlatform
      line={line}
      userId={ME}
      remote={remote}
      fresh={NONE}
      onCheckedChange={() => {}}
      onPress={() => {}}
      onRemove={() => {}}
    />
  );
}

const notice = () => document.querySelector('[data-slot="line-late"]');
const said = () =>
  document.querySelector('[data-slot="line-announcement"]')?.textContent;
const node = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-slot="line-rail"] [data-stop="${id}"]`,
  )!;
const branch = (id: string) =>
  node(id).querySelector<HTMLElement>('[data-slot="line-behind"]');

describe("LinePlatform, what is left behind", () => {
  it("marks a passed station with something to pick: a branch with the count, said by its node", () => {
    render(
      platform(
        lineOf(
          [
            station(BAKERY, [item("Pan"), item("Galletas")]),
            station(VEGETABLES, [item("Tomates", { checked: true })]),
            station(DAIRY, [item("Leche")]),
          ],
          DAIRY.id,
          [BAKERY.id, VEGETABLES.id],
        ),
      ),
    );
    expect(branch(BAKERY.id)).toHaveTextContent(t.behindTag(2));
    expect(branch(BAKERY.id)).toHaveAttribute("aria-hidden", "true");
    expect(node(BAKERY.id)).toHaveTextContent(
      `${t.goTo("Panadería")}${t.nodeSpoken(0, 2)}${t.behindSpoken(2)}`,
    );
    // Passed with everything in the cart, and the station you are at: none.
    expect(branch(VEGETABLES.id)).toBeNull();
    expect(branch(DAIRY.id)).toBeNull();
    // Nothing arrived: a first render (a reload) says nothing.
    expect(notice()).toBeNull();
    expect(said()).toBe("");
  });

  it("pulses the branch while another member's change waits there", () => {
    const bread = item("Pan", { by: ANA });
    const stations = [
      station(BAKERY, [bread]),
      station(DAIRY, [item("Leche")]),
    ];
    const { rerender } = render(
      platform(lineOf(stations, DAIRY.id, [BAKERY.id]), new Set([bread.id])),
    );
    expect(branch(BAKERY.id)).toHaveAttribute("data-pulsing", "true");
    rerender(platform(lineOf(stations, DAIRY.id, [BAKERY.id])));
    expect(branch(BAKERY.id)).not.toHaveAttribute("data-pulsing");
  });

  it("says that another member added to a passed station, and Volver goes there", () => {
    const move = vi.fn();
    const milk = station(DAIRY, [item("Leche")]);
    const { rerender } = render(
      platform(
        lineOf(
          [station(BAKERY, [item("Pan", { checked: true })]), milk],
          DAIRY.id,
          [BAKERY.id],
          move,
        ),
      ),
    );
    rerender(
      platform(
        lineOf(
          [
            station(BAKERY, [
              item("Pan", { checked: true }),
              item("Pan de campo", { by: ANA }),
            ]),
            milk,
          ],
          DAIRY.id,
          [BAKERY.id],
          move,
        ),
      ),
    );
    const text = t.late.byOther("Pan de campo", "Panadería");
    expect(notice()).toHaveTextContent(text);
    expect(said()).toBe(text);

    fireEvent.click(screen.getByRole("button", { name: t.late.back }));
    expect(move).toHaveBeenCalledWith(BAKERY.id);
    expect(document.getElementById(LINE_HEADING_ID)).toHaveFocus();
  });

  it("says it of your own product too, also at the checkout", () => {
    const bread = station(BAKERY, [item("Pan", { checked: true })]);
    const { rerender } = render(
      platform(lineOf([bread], CHECKOUT, [BAKERY.id])),
    );
    // A category new to the trip: at the checkout every station is behind.
    rerender(
      platform(
        lineOf([bread, station(DAIRY, [item("Queso")])], CHECKOUT, [
          BAKERY.id,
          DAIRY.id,
        ]),
      ),
    );
    expect(notice()).toHaveTextContent(t.late.bySelf("Queso", "Lácteos"));
  });

  it("says nothing of a product that arrives where you are, or ahead", () => {
    const stations = [
      station(BAKERY, [item("Pan", { checked: true })]),
      station(VEGETABLES, [item("Tomates")]),
      station(DAIRY, [item("Leche")]),
    ];
    const { rerender } = render(
      platform(lineOf(stations, VEGETABLES.id, [BAKERY.id])),
    );
    rerender(
      platform(
        lineOf(
          [
            stations[0],
            station(VEGETABLES, [
              item("Tomates"),
              item("Lechuga", { by: ANA }),
            ]),
            station(DAIRY, [item("Leche"), item("Queso", { by: ANA })]),
          ],
          VEGETABLES.id,
          [BAKERY.id],
        ),
      ),
    );
    expect(notice()).toBeNull();
    expect(said()).toBe("");
  });

  it("drops the notice when the product is picked elsewhere, without saying anything new", async () => {
    const milk = station(DAIRY, [item("Leche")]);
    const late = item("Pan", { by: ANA });
    const { rerender } = render(platform(lineOf([milk], DAIRY.id, [])));
    rerender(
      platform(lineOf([station(BAKERY, [late]), milk], DAIRY.id, [BAKERY.id])),
    );
    const text = t.late.byOther("Pan", "Panadería");
    expect(notice()).toHaveTextContent(text);
    rerender(
      platform(
        lineOf(
          [station(BAKERY, [{ ...late, checked: true }]), milk],
          DAIRY.id,
          [BAKERY.id],
        ),
      ),
    );
    expect(said()).toBe(text);
    // It fades out (Collapse) and is gone.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: t.late.back })).toBeNull(),
    );
  });

  it("drops the notice on moving, and says where you arrived", async () => {
    const milk = station(DAIRY, [item("Leche")]);
    const tomatoes = station(VEGETABLES, [item("Tomates")]);
    const bread = station(BAKERY, [item("Pan", { by: ANA })]);
    const { rerender } = render(
      platform(lineOf([tomatoes, milk], VEGETABLES.id, [])),
    );
    rerender(
      platform(lineOf([bread, tomatoes, milk], VEGETABLES.id, [BAKERY.id])),
    );
    expect(notice()).not.toBeNull();
    rerender(
      platform(
        lineOf([bread, tomatoes, milk], DAIRY.id, [BAKERY.id, VEGETABLES.id]),
      ),
    );
    expect(said()).toBe(t.arrived("Lácteos", 3, 3));
    // It fades out (Collapse) and is gone.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: t.late.back })).toBeNull(),
    );
    // Still behind: the branch stays.
    expect(branch(BAKERY.id)).toHaveTextContent(t.behindTag(1));
  });
});
