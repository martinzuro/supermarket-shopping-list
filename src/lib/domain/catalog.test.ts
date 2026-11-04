import { describe, expect, it } from "vitest";
import {
  frequentsOf,
  NO_RHYTHMS,
  rememberedAmount,
  suggestionsFor,
  usualsOf,
  USUAL_WINDOW_DAYS,
  type Rhythms,
} from "./catalog";
import { normalizeName } from "./normalize-name";
import type { KnownRhythm } from "./rhythm";

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

/** A product with a known rhythm, last bought `ago` days ago. */
function bought(interval_days: number, ago: number): KnownRhythm {
  return { times_bought: 3, last_bought_at: daysAgo(ago), interval_days };
}

describe("usualsOf", () => {
  it("is the products added at least three times, the last one recently, all due without trips", () => {
    const usuals = usualsOf(catalog, none, NOW);
    expect(names(usuals.due)).toEqual([
      "Leche",
      "Leche descremada",
      "Dulce de leche",
      "Café",
    ]);
    expect(usuals.later).toEqual([]);
  });

  it("counts the window's last day in, and the day after out", () => {
    const edge = [
      entry("Aceite", 3, USUAL_WINDOW_DAYS),
      entry("Vinagre", 3, USUAL_WINDOW_DAYS + 1),
    ];
    expect(names(usualsOf(edge, none, NOW).due)).toEqual(["Aceite"]);
  });

  it("leaves out what is pending, and stops at the limit", () => {
    expect(
      names(usualsOf(catalog, new Set(["leche"]), NOW, NO_RHYTHMS, 2).due),
    ).toEqual(["Leche descremada", "Dulce de leche"]);
  });

  it("follows the rhythm the trips know: due before the next trip, still at home otherwise", () => {
    const rhythms: Rhythms = {
      listInterval: 7,
      products: {
        // Of every trip: due.
        leche: bought(7, 7),
        // Every three weeks, bought a week ago: there is some left.
        cafe: bought(21, 7),
        // Added long ago by the catalog, but the trips say ten days ago:
        // the rhythm wins, and it is quarterly.
        yerba: bought(90, 10),
        // Two adds only, but a rhythm: usual by it.
        lechuga: bought(14, 14),
      },
    };
    const usuals = usualsOf(catalog, none, NOW, rhythms);
    expect(names(usuals.due)).toEqual([
      "Leche",
      "Leche descremada",
      "Dulce de leche",
      "Lechuga",
    ]);
    expect(names(usuals.later)).toEqual(["Yerba", "Café"]);
  });

  it("drops a product with a rhythm after twice its gap, never before the catalog's window", () => {
    const rhythms: Rhythms = {
      listInterval: 7,
      products: {
        // Weekly, two months ago: gone (the window, not twice a week).
        leche: bought(7, USUAL_WINDOW_DAYS + 1),
        // Quarterly, six months ago: the last day in.
        cafe: bought(90, 180),
        // A day more: out, whatever its adds.
        pan: bought(90, 181),
      },
    };
    const usuals = usualsOf(catalog, none, NOW, rhythms);
    expect(names(usuals.due)).toEqual([
      "Leche descremada",
      "Dulce de leche",
      "Café",
    ]);
    expect(usuals.later).toEqual([]);
  });

  it("caps each group on its own", () => {
    const rhythms: Rhythms = {
      listInterval: 7,
      products: { leche: bought(21, 7), yerba: bought(21, 7) },
    };
    const usuals = usualsOf(catalog, none, NOW, rhythms, 1);
    expect(names(usuals.due)).toEqual(["Leche descremada"]);
    expect(names(usuals.later)).toEqual(["Leche"]);
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
