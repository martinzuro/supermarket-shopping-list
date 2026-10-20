import { describe, expect, it } from "vitest";
import {
  formatPriceField,
  lineTotal,
  parsePriceField,
  priceBasis,
  priceFactor,
  rememberedPrice,
} from "./price";

describe("priceBasis", () => {
  it.each([
    ["kg", "kg"],
    ["g", "kg"],
    ["Kilos", "kg"],
    ["L", "L"],
    ["ml", "L"],
    ["litros", "L"],
    [null, "unit"],
    ["paquete", "unit"],
    ["bolsa grande", "unit"],
  ] as const)("%j is priced per %j", (unit, basis) => {
    expect(priceBasis(unit)).toBe(basis);
  });
});

describe("priceFactor", () => {
  it.each([
    [3, null, 3],
    [2, "paquetes", 2],
    [1.5, "kg", 1.5],
    [500, "g", 0.5],
    [250, "ml", 0.25],
    [null, "kg", 1],
    [null, "g", 1],
    [null, null, 1],
  ] as const)("%j %j is %j of the basis", (quantity, unit, factor) => {
    expect(priceFactor(quantity, unit)).toBe(factor);
  });
});

describe("lineTotal", () => {
  it("is the price times the quantity in the price's basis", () => {
    expect(lineTotal({ estimated_price: 45, quantity: 3, unit: null })).toBe(
      135,
    );
    expect(lineTotal({ estimated_price: 450, quantity: 200, unit: "g" })).toBe(
      90,
    );
    expect(lineTotal({ estimated_price: 89, quantity: 1.5, unit: "kg" })).toBe(
      133.5,
    );
    expect(lineTotal({ estimated_price: 0.1, quantity: 3, unit: null })).toBe(
      0.3,
    );
  });

  it("is the price alone without quantity, and null without price", () => {
    expect(lineTotal({ estimated_price: 89 })).toBe(89);
    expect(lineTotal({ estimated_price: null, quantity: 3, unit: null })).toBe(
      null,
    );
  });
});

describe("parsePriceField", () => {
  it.each([
    ["120", 120],
    ["120,5", 120.5],
    ["120,50", 120.5],
    ["3.99", 3.99],
    ["3.5", 3.5],
    ["1.200", 1200],
    ["12.000", 12000],
    ["3.999", 3999],
    ["1.200,50", 1200.5],
    ["1.234.567", 1234567],
    ["$120", 120],
    ["$ 1.200", 1200],
    ["US$ 3,99", 3.99],
    ["0", 0],
    ["  45 ", 45],
  ])("reads %j as %j", (text, value) => {
    expect(parsePriceField(text)).toBe(value);
  });

  it("is null when empty", () => {
    expect(parsePriceField("")).toBeNull();
    expect(parsePriceField("  ")).toBeNull();
    expect(parsePriceField("$")).toBeNull();
  });

  it.each([
    "abc",
    "-5",
    "1,200",
    "12,345",
    "1.2.3",
    "120,",
    "10.000.000",
    "1e3",
  ])("rejects %j", (text) => {
    expect(parsePriceField(text)).toBe("invalid");
  });
});

describe("formatPriceField", () => {
  it.each([
    [null, ""],
    [120, "120"],
    [120.5, "120,5"],
    [1200, "1200"],
    [3.99, "3,99"],
  ] as const)("writes %j as %j, which reads back the same", (price, text) => {
    expect(formatPriceField(price)).toBe(text);
    expect(parsePriceField(text)).toBe(price);
  });
});

describe("rememberedPrice", () => {
  const catalog = [
    { name_normalized: "leche", last_price: 45, last_currency: "UYU" },
    {
      name_normalized: "aceite de oliva",
      last_price: 12.5,
      last_currency: "USD",
    },
    { name_normalized: "pan", last_price: null, last_currency: null },
    { name_normalized: "yerba", last_price: 210, last_currency: null },
  ];

  it("is the catalog's last price and currency, by normalized name", () => {
    expect(rememberedPrice("  LECHE ", catalog)).toEqual({
      price: 45,
      currency: "UYU",
    });
    expect(rememberedPrice("Aceite de Oliva", catalog)).toEqual({
      price: 12.5,
      currency: "USD",
    });
  });

  it.each([
    ["a product the catalog does not know", "Arroz"],
    ["an entry without price", "Pan"],
    ["a price without its currency", "Yerba"],
  ])("is null for %s", (_label, name) => {
    expect(rememberedPrice(name, catalog)).toBeNull();
  });
});
