import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { estimateOf } from "@/lib/domain";
import { texts } from "@/lib/texts";
import { EstimateLine } from "./estimate-line";

const t = texts.list.estimate;

function item(
  estimated_price: number | null,
  currency: string | null = "UYU",
  extra: { quantity?: number; unit?: string } = {},
) {
  return { estimated_price, currency, deleted_at: null, ...extra };
}

function show(...items: ReturnType<typeof item>[]) {
  return render(<EstimateLine estimate={estimateOf(items)} />);
}

describe("EstimateLine", () => {
  it("shows one total with its label when there is one currency", () => {
    show(item(100), item(34.5));
    expect(screen.getByText(t.label)).toBeInTheDocument();
    expect(screen.getByText("$ 134,50")).toBeInTheDocument();
    expect(screen.queryByText(/US\$/)).toBeNull();
    expect(screen.queryByText(/ · /)).toBeNull();
    expect(screen.queryByText(/con precio/)).toBeNull();
  });

  it("totals the lines: price times quantity in the price's basis", () => {
    show(item(90, "UYU", { quantity: 1500, unit: "g" }), item(12, "UYU"));
    expect(screen.getByText("$ 147")).toBeInTheDocument();
  });

  it("shows a total per currency, pesos first", () => {
    const { container } = show(item(12, "USD"), item(1234), item(5, "USD"));
    const amounts = Array.from(
      container.querySelectorAll("[data-currency]"),
    ).map((one) => one.textContent);
    expect(amounts).toEqual(["$\u00a01.234", "US$\u00a017"]);
    expect(container.querySelector("[data-numeric]")).toHaveClass("font-mono");
    // The separator is for the eyes: a screen reader reads the amounts.
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("·");
  });

  it("says how many it covers when some lack a price", () => {
    show(item(100), item(null), item(null), item(50, "USD"));
    expect(screen.getByText(t.covered(2, 4))).toBeInTheDocument();
    expect(screen.getByText("$ 100")).toBeInTheDocument();
  });

  it("does not count what was deleted", () => {
    const items = [
      item(100),
      { ...item(null), deleted_at: "2026-10-20T00:00:00Z" },
    ];
    render(<EstimateLine estimate={estimateOf(items)} />);
    expect(screen.queryByText(/con precio/)).toBeNull();
  });

  it("is nothing when no item has a price, never a zero", () => {
    const { container } = show(item(null), item(null));
    expect(container).toBeEmptyDOMElement();
    const empty = render(<EstimateLine estimate={estimateOf([])} />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("counts a free item (price 0) as priced", () => {
    show(item(0), item(null));
    expect(screen.getByText("$ 0")).toBeInTheDocument();
    expect(screen.getByText(t.covered(1, 2))).toBeInTheDocument();
  });
});
