import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Category, Item } from "@/lib/queries";
import { texts } from "@/lib/texts";
import { LineTicket } from "./line-ticket";
import type { Station } from "./use-line";

const t = texts.line.ticket;
const LIST = "list";

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

const item = (
  name: string,
  checked: boolean,
  price: number | null = null,
  currency = "UYU",
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
  estimated_price: price,
  currency,
  created_at: "",
  updated_at: "",
  deleted_at: null,
  created_by: "me",
  trip_id: null,
});

const station = (one: Category, items: Item[]): Station => ({
  id: one.id,
  category: one,
  items,
  pending: items.filter((each) => !each.checked).length,
});

const BAKERY = category("bakery", "Panadería", 0);
const DAIRY = category("dairy", "Lácteos", 1);
const PANTRY = category("pantry", "Almacén", 2);

const slot = (name: string) =>
  document.querySelector<HTMLElement>(`[data-slot="${name}"]`);

describe("LineTicket", () => {
  it("tells the trip: a line per station, the cart, its estimate per currency and what is pending", () => {
    render(
      <LineTicket
        animate={false}
        stations={[
          station(BAKERY, [item("Pan", true, 90)]),
          station(DAIRY, [
            item("Leche", true, 45),
            item("Queso", false, 300),
            item("Manteca", false),
          ]),
          station(PANTRY, [item("Café", true, 6, "USD"), item("Yerba", true)]),
        ]}
      />,
    );
    const ticket = screen.getByRole("region", { name: t.eyebrow });
    const lines = within(ticket).getAllByRole("list")[0];
    expect(
      [...lines.querySelectorAll("[data-station]")].map(
        (line) => line.textContent,
      ),
    ).toEqual([
      `Panadería${t.count(1, 1)}`,
      `Lácteos${t.count(1, 3)}`,
      `Almacén${t.count(2, 2)}`,
    ]);
    // Three stations, and the totals are not two more of them.
    expect(within(lines).getAllByRole("listitem")).toHaveLength(3);
    expect(slot("line-ticket-total")).toHaveTextContent(t.count(4, 6));
    // Only what is in the cart is estimated, and it says how much of it
    // had a price.
    expect(slot("line-ticket-estimate")).toHaveTextContent("$ 135 · , US$ 6");
    expect(slot("line-ticket-estimate")).toHaveTextContent(
      texts.list.estimate.covered(3, 4),
    );
    // The stub: only the stations with something pending.
    const stub = slot("line-stub")!;
    expect(
      [...stub.querySelectorAll("[data-station]")].map(
        (line) => line.textContent,
      ),
    ).toEqual([`Lácteos${t.missingCount(2)}`]);
    expect(stub).toHaveTextContent(t.hint);
  });

  it("has no estimate without prices, and says that nothing was missed", () => {
    render(
      <LineTicket
        animate={false}
        stations={[station(BAKERY, [item("Pan", true)])]}
      />,
    );
    expect(slot("line-ticket-estimate")).toBeNull();
    expect(slot("line-stub")).toHaveTextContent(t.allIn);
    expect(slot("line-stub")).not.toHaveTextContent(t.hint);
  });
});
