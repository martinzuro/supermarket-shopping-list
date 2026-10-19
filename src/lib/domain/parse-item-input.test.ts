import { describe, expect, it } from "vitest";
import { parseItemInput } from "./parse-item-input";

type Case = [string, string, number | null, string | null];

function check([input, name, quantity, unit]: Case) {
  expect(parseItemInput(input)).toEqual({ name, quantity, unit });
}

describe("parseItemInput", () => {
  describe("leading form", () => {
    it.each<Case>([
      ["2 kg tomates", "tomates", 2, "kg"],
      ["2kg tomates", "tomates", 2, "kg"],
      ["3 leches", "leches", 3, null],
      ["3 Leche entera", "Leche entera", 3, null],
      ["1,5 L leche", "leche", 1.5, "L"],
      ["1.5 L leche", "leche", 1.5, "L"],
      ["1,5L leche", "leche", 1.5, "L"],
      ["500 g jamón", "jamón", 500, "g"],
      ["0,5 kg queso", "queso", 0.5, "kg"],
      ["2 paquetes de fideos", "fideos", 2, "paquetes"],
      ["2 kg de tomates", "tomates", 2, "kg"],
      ["2 KG De Tomates", "Tomates", 2, "kg"],
      ["1 docena de huevos", "huevos", 1, "docena"],
      ["2 kg. tomates", "tomates", 2, "kg"],
      ["2 Lechuga", "Lechuga", 2, null],
      ["2 leche 3", "leche 3", 2, null],
      ["1000 g de jamón", "jamón", 1000, "g"],
      ["1/4 de queso", "queso", 0.25, null],
      ["2 de leche", "leche", 2, null],
    ])("parses %j", (...args) => check(args));
  });

  describe("trailing form", () => {
    it.each<Case>([
      ["tomates 2 kg", "tomates", 2, "kg"],
      ["Jamón 1000 g", "Jamón", 1000, "g"],
      ["Agua 1500 ml", "Agua", 1500, "ml"],
      ["Tomates perita, 2 kg", "Tomates perita", 2, "kg"],
      ["leche; 3", "leche", 3, null],
      ["tomates 2kg", "tomates", 2, "kg"],
      ["leche 3", "leche", 3, null],
      ["jamón 200g", "jamón", 200, "g"],
      ["Coca 1,5 L", "Coca", 1.5, "L"],
      ["Coca cola 1.5 lts", "Coca cola", 1.5, "L"],
      ["fideos 2 paquetes", "fideos", 2, "paquetes"],
      ["huevos 1 docena", "huevos", 1, "docena"],
      ["yogur 6 u", "yogur", 6, null],
      ["queso 1/2", "queso", 0.5, null],
      ["Leche 0,5 L", "Leche", 0.5, "L"],
    ])("parses %j", (...args) => check(args));
  });

  describe("multiplier form", () => {
    it.each<Case>([
      ["leche x3", "leche", 3, null],
      ["leche x 3", "leche", 3, null],
      ["leche X3", "leche", 3, null],
      ["x3 leche", "leche", 3, null],
      ["3x leche", "leche", 3, null],
      ["3 x leche", "leche", 3, null],
      ["leche 3x", "leche", 3, null],
      ["leche ×3", "leche", 3, null],
      ["leche × 3", "leche", 3, null],
      ["×3 leche", "leche", 3, null],
      ["3× leche", "leche", 3, null],
    ])("parses %j", (...args) => check(args));
  });

  describe("quantity formats", () => {
    it.each<Case>([
      ["1/2 kg pan", "pan", 0.5, "kg"],
      ["1/4 kg queso", "queso", 0.25, "kg"],
      ["queso 3/4 kg", "queso", 0.75, "kg"],
      ["½ kg pan", "pan", 0.5, "kg"],
      ["¼ L crema", "crema", 0.25, "L"],
      ["¾ kg harina", "harina", 0.75, "kg"],
      ["pan ½ kg", "pan", 0.5, "kg"],
      ["1/3 kg carne", "carne", 0.333, "kg"],
      ["999 caramelos", "caramelos", 999, null],
      ["0.001 kg sal", "sal", 0.001, "kg"],
    ])("parses %j", (...args) => check(args));
  });

  describe("units", () => {
    it.each([
      ["kg", "kg"],
      ["kgs", "kg"],
      ["kilo", "kg"],
      ["kilos", "kg"],
      ["KILOS", "kg"],
      ["g", "g"],
      ["gr", "g"],
      ["grs", "g"],
      ["gramo", "g"],
      ["gramos", "g"],
      ["l", "L"],
      ["L", "L"],
      ["lt", "L"],
      ["lts", "L"],
      ["litro", "L"],
      ["litros", "L"],
      ["Litros", "L"],
      ["ml", "ml"],
      ["cc", "ml"],
      ["ML", "ml"],
      ["u", null],
      ["un", null],
      ["unid", null],
      ["unidad", null],
      ["unidades", null],
      ["Unidades", null],
      ["paquete", "paquete"],
      ["paquetes", "paquetes"],
      ["docena", "docena"],
      ["docenas", "docenas"],
      ["lata", "lata"],
      ["latas", "latas"],
      ["botella", "botella"],
      ["botellas", "botellas"],
      ["caja", "caja"],
      ["cajas", "cajas"],
      ["bandeja", "bandeja"],
      ["bandejas", "bandejas"],
      ["frasco", "frasco"],
      ["frascos", "frascos"],
      ["atado", "atado"],
      ["atados", "atados"],
      ["bolsa", "bolsa"],
      ["bolsas", "bolsas"],
      ["sobre", "sobre"],
      ["sobres", "sobres"],
      ["maple", "maple"],
      ["maples", "maples"],
      ["rollo", "rollo"],
      ["rollos", "rollos"],
      ["pack", "pack"],
      ["packs", "packs"],
      ["Packs", "packs"],
    ])(
      "canonicalizes the unit %j as %j (leading and trailing)",
      (word, unit) => {
        check([`2 ${word} cosa`, "cosa", 2, unit]);
        check([`cosa 2 ${word}`, "cosa", 2, unit]);
      },
    );

    it("keeps an unknown word as part of the name", () => {
      check(["3 manzanas", "manzanas", 3, null]);
      check(["2 tomates cherry", "tomates cherry", 2, null]);
      check(["tomates cherry 2", "tomates cherry", 2, null]);
    });

    it("does not read the start of a word as a unit", () => {
      check(["2 lechuga", "lechuga", 2, null]);
      check(["2 gaseosas", "gaseosas", 2, null]);
      check(["2 uvas", "uvas", 2, null]);
    });
  });

  describe("do not parse", () => {
    it.each([
      ["Leche 0,5"],
      ["Coca Zero 2,25"],
      ["Fanta 2.25"],
      ["pañales talle 3"],
      ["zapatillas número 38"],
      ["Pinturas 2025"],
      ["2025 Pinturas"],
      ["Leche 0"],
      ["0 leche"],
      ["Leche 0,0"],
      ["Leche 1000"],
      ["1000 leches"],
      ["leche x0"],
      ["leche x1000"],
      ["leche 1/0"],
      ["7up"],
      ["Leche 0%"],
      ["Pilas AA"],
      ["Coca 1.5L zero"],
      ["Pan 3 quesos y jamón"],
      ["2 kg"],
      ["2kg"],
      ["2 paquetes"],
      ["2 L."],
      ["3"],
      ["x3"],
      ["3x"],
      ["×3"],
      ["½"],
      ["x"],
      ["kg"],
      ["leche"],
    ])("keeps %j as a plain name", (input) => {
      expect(parseItemInput(input)).toEqual({
        name: input,
        quantity: null,
        unit: null,
      });
    });

    it("falls through to the trailing form when the leading number is invalid", () => {
      check(["2025 Pinturas 3", "2025 Pinturas", 3, null]);
    });
  });

  describe("whitespace and casing", () => {
    it.each<Case>([
      ["  2   kg   tomates  ", "tomates", 2, "kg"],
      ["Leche   entera   x3", "Leche entera", 3, null],
      ["2 kg Tomates   PERita", "Tomates PERita", 2, "kg"],
      ["Jamón\tcocido\n 200 g", "Jamón cocido", 200, "g"],
      ["Queso Colonia 1/2 kg", "Queso Colonia", 0.5, "kg"],
      ["  Dulce   de   leche  ", "Dulce de leche", null, null],
    ])("parses %j", (...args) => check(args));

    it("returns an empty name for empty or whitespace-only input", () => {
      for (const input of ["", "   ", "\t\n "]) {
        expect(parseItemInput(input)).toEqual({
          name: "",
          quantity: null,
          unit: null,
        });
      }
    });
  });

  describe("precedence", () => {
    it("prefers the leading form over the trailing one", () => {
      check(["2 leche 3", "leche 3", 2, null]);
      check(["2 kg tomates 3 kg", "tomates 3 kg", 2, "kg"]);
    });

    it("prefers a multiplier over a plain count", () => {
      check(["3x leche 2", "leche 2", 3, null]);
    });
  });
});
