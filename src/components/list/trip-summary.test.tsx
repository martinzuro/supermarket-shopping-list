import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { estimateOf } from "@/lib/domain";
import { texts } from "@/lib/texts";
import { ShoppingTotals } from "./shopping-totals";
import { TripSummary, tripSummarySpoken } from "./trip-summary";

const t = texts.moments.cartEmptied.summary;
const s = texts.shopping.totals;

/** The text as read, with the no-break spaces of the amounts as spaces. */
const read = (element: Element) =>
  (element.textContent ?? "").replace(/\s/g, " ");

const priced = (price: number | null, currency = "UYU", quantity = 1) => ({
  estimated_price: price,
  currency,
  quantity,
  unit: null,
  deleted_at: null,
});

describe("TripSummary (M-3)", () => {
  it("says how much went through, its estimate and what is left", () => {
    const estimate = estimateOf([priced(100, "UYU", 2), priced(6, "USD")]);
    render(<TripSummary count={2} estimate={estimate} remaining={3} />);
    const figures = screen.getAllByRole("definition").map(read);
    expect(figures).toEqual(["2 productos", "$ 200 · US$ 6", "3 productos"]);
    expect(screen.getAllByRole("term").map((one) => one.textContent)).toEqual([
      t.checkout,
      t.estimate,
      t.remaining,
    ]);
  });

  it("without prices, no estimate; with some, how many it covers", () => {
    const { rerender } = render(
      <TripSummary
        count={1}
        estimate={estimateOf([priced(null)])}
        remaining={0}
      />,
    );
    expect(screen.getAllByRole("definition").map(read)).toEqual([
      "1 producto",
      t.nothing,
    ]);

    rerender(
      <TripSummary
        count={2}
        estimate={estimateOf([priced(50), priced(null)])}
        remaining={0}
      />,
    );
    expect(read(screen.getAllByRole("definition")[1])).toBe(
      `$ 50${texts.list.estimate.covered(1, 2)}`,
    );
  });

  it("is said in one go", () => {
    expect(
      tripSummarySpoken({
        count: 3,
        estimate: estimateOf([priced(334), priced(6, "USD")]),
        remaining: 1,
      }).replace(/\s/g, " "),
    ).toBe(
      `${t.checkout}: 3 productos. ${t.estimate}: $ 334 · US$ 6. ${t.remaining}: 1 producto.`,
    );
    expect(
      tripSummarySpoken({
        count: 1,
        estimate: estimateOf([priced(null)]),
        remaining: 0,
      }),
    ).toBe(`${t.checkout}: 1 producto. ${t.remaining}: ${t.nothing}.`);
  });
});

describe("ShoppingTotals (M-2)", () => {
  it("is not there while nothing has a price", () => {
    const { container } = render(
      <ShoppingTotals
        cart={estimateOf([priced(null)])}
        pending={estimateOf([priced(null)])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tells the cart on the left and about what is left on the right", () => {
    const { container, rerender } = render(
      <ShoppingTotals
        cart={estimateOf([])}
        pending={estimateOf([priced(708), priced(5, "USD")])}
      />,
    );
    const line = () =>
      container.querySelector('[data-slot="shopping-totals"]')!.textContent;
    expect(container.querySelector('[data-slot="shopping-cart"]')).toBeNull();
    expect(line()?.replace(/\s/g, " ")).toBe(
      `${s.remaining}${s.about}${s.aboutSpoken}$ 708 · US$ 5`,
    );

    rerender(
      <ShoppingTotals
        cart={estimateOf([priced(253)])}
        pending={estimateOf([priced(708)])}
      />,
    );
    expect(line()?.replace(/\s/g, " ")).toBe(
      `${s.cart}$ 253${s.remaining}${s.about}${s.aboutSpoken}$ 708`,
    );

    // Everything in the cart: only the cart.
    rerender(
      <ShoppingTotals
        cart={estimateOf([priced(961)])}
        pending={estimateOf([])}
      />,
    );
    expect(
      container.querySelector('[data-slot="shopping-remaining"]'),
    ).toBeNull();
    expect(line()?.replace(/\s/g, " ")).toBe(`${s.cart}$ 961`);
  });
});
