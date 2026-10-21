import { describe, expect, it } from "vitest";
import { pastedList, splitPastedList } from "./paste";

describe("splitPastedList", () => {
  it("takes one product per line, as it would be typed", () => {
    expect(splitPastedList("Leche\n2 kg tomates\nPan x2\n")).toEqual([
      "Leche",
      "2 kg tomates",
      "Pan x2",
    ]);
    expect(splitPastedList("Leche\r\nPan\rYerba")).toEqual([
      "Leche",
      "Pan",
      "Yerba",
    ]);
  });

  it("drops bullets, numbering, checklist marks and emoji", () => {
    expect(
      splitPastedList(
        "- Leche\n• Pan\n* Yerba\n1. Café\n2) Arroz\n[ ] Fideos\n[x] Aceite\n☐ Sal\n🛒 Azúcar",
      ),
    ).toEqual([
      "Leche",
      "Pan",
      "Yerba",
      "Café",
      "Arroz",
      "Fideos",
      "Aceite",
      "Sal",
      "Azúcar",
    ]);
  });

  it("keeps the numbers of a quantity at the start", () => {
    expect(
      splitPastedList("2 kg tomates\n1.5 L leche\n½ kg queso\nx3 yogur"),
    ).toEqual(["2 kg tomates", "1.5 L leche", "½ kg queso", "x3 yogur"]);
  });

  it("splits a line by commas and semicolons, never a decimal comma", () => {
    expect(splitPastedList("leche, pan, 1,5 kg de papas; yerba")).toEqual([
      "leche",
      "pan",
      "1,5 kg de papas",
      "yerba",
    ]);
  });

  it("keeps an amount after a comma with its product", () => {
    expect(splitPastedList("Tomates, 2 kg\nQueso, 500 g, pan")).toEqual([
      "Tomates, 2 kg",
      "Queso, 500 g",
      "pan",
    ]);
    // A count with a product is a product of its own.
    expect(splitPastedList("leche, 2 manzanas, pan x3")).toEqual([
      "leche",
      "2 manzanas",
      "pan x3",
    ]);
    expect(splitPastedList("Fideos, 2 paquetes\nPan, 3")).toEqual([
      "Fideos, 2 paquetes",
      "Pan, 3",
    ]);
    // A unit may be glued to its number; other letters make a name.
    expect(splitPastedList("Jamón, 200g\npan, 7up")).toEqual([
      "Jamón, 200g",
      "pan",
      "7up",
    ]);
  });

  it("leaves out titles, empty lines and lines with no letters", () => {
    expect(
      splitPastedList("Lista del súper:\n\nLeche\n---\n123\n   \nPan"),
    ).toEqual(["Leche", "Pan"]);
  });

  it("takes each product once, by its normalized name", () => {
    expect(splitPastedList("Leche\nleche\n2 LÉCHE\nPan")).toEqual([
      "Leche",
      "Pan",
    ]);
  });

  it("cuts a name to the column's length", () => {
    const long = "a".repeat(250);
    expect(splitPastedList(`${long}\nPan`)[0]).toHaveLength(200);
  });

  it("is not a list with fewer than two products", () => {
    expect(splitPastedList("Leche")).toEqual(["Leche"]);
    expect(splitPastedList("Fanta 2,25")).toEqual(["Fanta 2,25"]);
    expect(splitPastedList("")).toEqual([]);
  });

  it("drops marks nested in each other, and WhatsApp's bold and italic", () => {
    expect(
      splitPastedList(
        "- [x] pan\n* [X] queso\n1. - yerba\n1- leche\n2 - arroz\n1️⃣ café\n*Aceite*\n_sal_\n~azúcar~\n(fideos)",
      ),
    ).toEqual([
      "pan",
      "queso",
      "yerba",
      "leche",
      "arroz",
      "café",
      "Aceite",
      "sal",
      "azúcar",
      "fideos",
    ]);
  });

  it("drops the note of a sent list, commas and all (F-3)", () => {
    expect(
      splitPastedList(
        "- Leche ×3 — _descremada, la de caja_\n- Pan — _de molde_\nTé — verde",
      ),
    ).toEqual(["Leche ×3", "Pan", "Té — verde"]);
  });

  it("drops the date and author of messages copied from WhatsApp", () => {
    expect(
      splitPastedList(
        "[21/10/26, 10:30:12] Mamá: Leche\n[21/10/26, 10:31:02] Mamá: 2 kg tomates\n21/10/26, 10:32 - Juan: Pan",
      ),
    ).toEqual(["Leche", "2 kg tomates", "Pan"]);
  });

  it("drops an amount on its own, and one after a product that has its own", () => {
    expect(splitPastedList("x3, leche\n2 kg\n2 tomates, 1 kg")).toEqual([
      "leche",
      "2 tomates",
    ]);
  });

  it("never cuts inside an emoji", () => {
    const product = splitPastedList(`${"a".repeat(199)}😀b\nPan`)[0];
    expect(Array.from(product)).toHaveLength(200);
    expect(product.endsWith("😀")).toBe(true);
  });
});

describe("pastedList", () => {
  it("is a list with two products on several lines", () => {
    expect(pastedList("leche\npan")).toEqual({
      products: ["leche", "pan"],
      oneLine: false,
    });
  });

  it("needs three on one line: two parts are often one product", () => {
    expect(pastedList("Aceite de oliva, extra virgen")).toBeNull();
    expect(pastedList("leche, pan, yerba")).toEqual({
      products: ["leche", "pan", "yerba"],
      oneLine: true,
    });
  });

  it("is not a list with a single product", () => {
    expect(pastedList("Dulce de leche")).toBeNull();
    expect(pastedList("leche\n\n")).toBeNull();
  });
});
