import { describe, expect, it } from "vitest";
import {
  frequentsOf,
  rememberedAmount,
  suggestionsFor,
  usualsOf,
  USUAL_WINDOW_DAYS,
} from "./catalog";
import { normalizeName } from "./normalize-name";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

function entry(name: string, times_added: number, days = 1) {
  return {
    name_normalized: normalizeName(name),
    display_name: name,
    times_added,
    last_added_at: daysAgo(days),
  };
}

const catalog = [
  entry("Leche descremada", 5, 3),
  entry("Leche", 9, 2),
  entry("Lechuga", 2, 10),
  entry("Dulce de leche", 4, 1),
  entry("Café", 3, 1),
  entry("Pan", 1, 1),
  entry("Yerba", 6, 200),
];
const names = (entries: { display_name: string }[]) =>
  entries.map((e) => e.display_name);
const none = new Set<string>();

describe("suggestionsFor", () => {
  it("puts names that start with the text first, then names with a word that does, each by use", () => {
    expect(names(suggestionsFor("lech", catalog, none))).toEqual([
      "Leche",
      "Leche descremada",
      "Lechuga",
      "Dulce de leche",
    ]);
  });

  it("matches the normalized name: case and accents do not matter", () => {
    expect(names(suggestionsFor("CAFE", catalog, none))).toEqual(["Café"]);
    expect(names(suggestionsFor("  café ", catalog, none))).toEqual(["Café"]);
  });

  it("leaves out what is already pending", () => {
    expect(
      names(suggestionsFor("lech", catalog, new Set(["leche", "lechuga"]))),
    ).toEqual(["Leche descremada", "Dulce de leche"]);
  });

  it("proposes nothing for an empty text, and at most the limit", () => {
    expect(suggestionsFor("", catalog, none)).toEqual([]);
    expect(suggestionsFor("   ", catalog, none)).toEqual([]);
    expect(suggestionsFor("l", catalog, none, 2)).toHaveLength(2);
  });

  it("does not match in the middle of a word", () => {
    expect(suggestionsFor("che", catalog, none)).toEqual([]);
  });
});

describe("frequentsOf", () => {
  it("is the products added at least twice, most used first, then the most recent", () => {
    const tied = [entry("Arroz", 3, 5), entry("Fideos", 3, 0)];
    expect(names(frequentsOf([...catalog, ...tied], none))).toEqual([
      "Leche",
      "Yerba",
      "Leche descremada",
      "Dulce de leche",
      "Fideos",
      "Café",
      "Arroz",
      "Lechuga",
    ]);
  });

  it("leaves out what is pending, and stops at the limit", () => {
    expect(names(frequentsOf(catalog, new Set(["leche"]), 2))).toEqual([
      "Yerba",
      "Leche descremada",
    ]);
  });

  it("is empty without history", () => {
    expect(frequentsOf([entry("Pan", 1)], none)).toEqual([]);
  });
});

describe("usualsOf", () => {
  it("is the products added at least three times, the last one recently", () => {
    expect(names(usualsOf(catalog, none, NOW))).toEqual([
      "Leche",
      "Leche descremada",
      "Dulce de leche",
      "Café",
    ]);
  });

  it("counts the window's last day in, and the day after out", () => {
    const edge = [
      entry("Aceite", 3, USUAL_WINDOW_DAYS),
      entry("Vinagre", 3, USUAL_WINDOW_DAYS + 1),
    ];
    expect(names(usualsOf(edge, none, NOW))).toEqual(["Aceite"]);
  });

  it("leaves out what is pending, and stops at the limit", () => {
    expect(names(usualsOf(catalog, new Set(["leche"]), NOW, 2))).toEqual([
      "Leche descremada",
      "Dulce de leche",
    ]);
  });
});

describe("rememberedAmount", () => {
  it("brings the last quantity with its unit", () => {
    expect(
      rememberedAmount({ last_quantity: 2, last_quantity_unit: "kg" }),
    ).toEqual({ quantity: 2, unit: "kg" });
    expect(
      rememberedAmount({ last_quantity: 3, last_quantity_unit: null }),
    ).toEqual({ quantity: 3, unit: null });
  });

  it("brings nothing without a quantity, not even a stray unit", () => {
    expect(
      rememberedAmount({ last_quantity: null, last_quantity_unit: "kg" }),
    ).toEqual({ quantity: null, unit: null });
  });
});
