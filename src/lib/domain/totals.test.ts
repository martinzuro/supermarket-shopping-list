import { describe, expect, it } from "vitest";
import { estimateOf, formatMoney, totalsByCurrency } from "./totals";

const item = (
  estimated_price: number | null,
  currency: string | null,
  deleted_at: string | null = null,
) => ({
  estimated_price,
  currency,
  deleted_at,
});

describe("totalsByCurrency", () => {
  it("returns an empty array without items", () => {
    expect(totalsByCurrency([])).toEqual([]);
  });

  it("sums a single currency", () => {
    expect(totalsByCurrency([item(100, "UYU"), item(50.5, "UYU")])).toEqual([
      { currency: "UYU", total: 150.5 },
    ]);
  });

  it("counts a null currency as UYU", () => {
    expect(totalsByCurrency([item(10, null), item(5, "UYU")])).toEqual([
      { currency: "UYU", total: 15 },
    ]);
  });

  it("skips items without price", () => {
    expect(
      totalsByCurrency([item(null, "USD"), item(null, null), item(3, "UYU")]),
    ).toEqual([{ currency: "UYU", total: 3 }]);
  });

  it("keeps a zero price", () => {
    expect(totalsByCurrency([item(0, "USD")])).toEqual([
      { currency: "USD", total: 0 },
    ]);
  });

  it("skips soft-deleted items", () => {
    expect(
      totalsByCurrency([
        item(10, "UYU"),
        item(99, "UYU", "2026-01-01T00:00:00Z"),
      ]),
    ).toEqual([{ currency: "UYU", total: 10 }]);
  });

  it("groups mixed currencies with UYU first and the rest alphabetical", () => {
    const result = totalsByCurrency([
      item(2, "USD"),
      item(1, "EUR"),
      item(100, "UYU"),
      item(3, "USD"),
      item(7, "ARS"),
    ]);
    expect(result).toEqual([
      { currency: "UYU", total: 100 },
      { currency: "ARS", total: 7 },
      { currency: "EUR", total: 1 },
      { currency: "USD", total: 5 },
    ]);
  });

  it("sorts alphabetically when there is no UYU", () => {
    expect(
      totalsByCurrency([item(1, "USD"), item(1, "EUR")]).map((t) => t.currency),
    ).toEqual(["EUR", "USD"]);
  });

  it("avoids floating point noise", () => {
    expect(totalsByCurrency([item(0.1, "UYU"), item(0.2, "UYU")])).toEqual([
      { currency: "UYU", total: 0.3 },
    ]);
  });
});

describe("totalsByCurrency, line totals", () => {
  it("multiplies the price by the quantity in the price's basis", () => {
    expect(
      totalsByCurrency([
        { estimated_price: 45, currency: "UYU", quantity: 3, unit: null },
        { estimated_price: 450, currency: "UYU", quantity: 200, unit: "g" },
        { estimated_price: 89, currency: "UYU", quantity: null, unit: "kg" },
        { estimated_price: 2, currency: "USD", quantity: 1.5, unit: "L" },
      ]),
    ).toEqual([
      // 135 + 90 + 89
      { currency: "UYU", total: 314 },
      { currency: "USD", total: 3 },
    ]);
  });
});

describe("totalsByCurrency, cents", () => {
  it("counts in cents, so float noise never turns a whole sum into decimals", () => {
    const totals = totalsByCurrency([
      { estimated_price: 0.01, currency: "UYU" },
      { estimated_price: 2.01, currency: "UYU" },
      { estimated_price: 0.98, currency: "UYU" },
    ]);
    expect(totals).toEqual([{ currency: "UYU", total: 3 }]);
    expect(formatMoney(totals[0].total, "UYU")).toBe(formatMoney(3, "UYU"));
  });

  it("writes an amount with noise as the whole amount it is", () => {
    expect(formatMoney(2.9999999999999996, "UYU")).toBe(formatMoney(3, "UYU"));
  });
});

describe("estimateOf", () => {
  it("tells how many live items the totals cover", () => {
    expect(
      estimateOf([
        { estimated_price: 10, currency: "UYU" },
        { estimated_price: null, currency: "UYU" },
        { estimated_price: 5, currency: "USD" },
        {
          estimated_price: 7,
          currency: "UYU",
          deleted_at: "2026-01-01T00:00:00Z",
        },
      ]),
    ).toEqual({
      totals: [
        { currency: "UYU", total: 10 },
        { currency: "USD", total: 5 },
      ],
      priced: 2,
      count: 3,
    });
  });

  it("has no totals when nothing has a price", () => {
    expect(estimateOf([{ estimated_price: null, currency: null }])).toEqual({
      totals: [],
      priced: 0,
      count: 1,
    });
  });
});

describe("formatMoney", () => {
  it("writes whole amounts without decimals and any other with two", () => {
    const uyu = (amount: number, digits: number) =>
      new Intl.NumberFormat("es-UY", {
        style: "currency",
        currency: "UYU",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(amount);
    expect(formatMoney(1234, "UYU")).toBe(uyu(1234, 0));
    expect(formatMoney(133.5, "UYU")).toBe(uyu(133.5, 2));
    expect(formatMoney(1234, "UYU").replace(/\D/g, "")).toBe("1234");
    expect(formatMoney(133.5, "UYU").replace(/\D/g, "")).toBe("13350");
  });

  it("matches Intl.NumberFormat es-UY", () => {
    expect(formatMoney(1234.5, "UYU")).toBe(
      new Intl.NumberFormat("es-UY", {
        style: "currency",
        currency: "UYU",
      }).format(1234.5),
    );
    expect(formatMoney(9.99, "USD")).toBe(
      new Intl.NumberFormat("es-UY", {
        style: "currency",
        currency: "USD",
      }).format(9.99),
    );
  });

  it("includes the digits of the amount", () => {
    expect(formatMoney(1234.5, "UYU").replace(/\D/g, "")).toContain("123450");
  });

  it("formats different currencies differently", () => {
    expect(formatMoney(10, "UYU")).not.toBe(formatMoney(10, "USD"));
  });
});
