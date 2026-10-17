import { describe, expect, it } from "vitest";
import { formatMoney, totalsByCurrency } from "./totals";

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

describe("formatMoney", () => {
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
