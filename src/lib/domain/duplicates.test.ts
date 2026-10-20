import { describe, expect, it } from "vitest";
import { addedQuantity, findPending, pendingMatchesFor } from "./duplicates";
import { normalizeName } from "./normalize-name";

let nextPosition = 0;
function item(
  name: string,
  { quantity = null as number | null, unit = null as string | null } = {},
) {
  nextPosition += 1;
  return {
    id: `id-${nextPosition}`,
    name,
    name_normalized: normalizeName(name),
    position: nextPosition,
    quantity,
    unit,
  };
}

const leche = item("Leche", { quantity: 3 });
const dulce = item("Dulce de leche");
const lechuga = item("Lechuga");
const pan = item("Pan");
// An older duplicate made before the add bar warned about them.
const lecheAgain = item("leche");
const pending = [lecheAgain, pan, lechuga, dulce, leche];

const names = (items: { name: string }[]) => items.map((one) => one.name);

describe("findPending", () => {
  it("finds the pending item of the same product, whatever the case and accents", () => {
    expect(findPending("leche", pending)).toBe(leche);
    expect(findPending("  LECHE ", pending)).toBe(leche);
    expect(findPending("pán", pending)).toBe(pan);
  });

  it("takes the first along the list when the product is there twice", () => {
    // leche has a lower position than lecheAgain: it was added first.
    expect(findPending("Leche", pending)?.id).toBe(leche.id);
  });

  it("finds nothing for another product, a part of a name, or nothing typed", () => {
    expect(findPending("Leche descremada", pending)).toBeUndefined();
    expect(findPending("lech", pending)).toBeUndefined();
    expect(findPending("", pending)).toBeUndefined();
    expect(findPending("   ", pending)).toBeUndefined();
  });
});

describe("pendingMatchesFor", () => {
  it("puts names that start with the text first, then a later word, each in list order", () => {
    expect(names(pendingMatchesFor("lech", pending))).toEqual([
      "Leche",
      "Lechuga",
      "Dulce de leche",
    ]);
  });

  it("offers each product once, and nothing for an empty text", () => {
    expect(names(pendingMatchesFor("leche", pending))).toEqual([
      "Leche",
      "Dulce de leche",
    ]);
    expect(pendingMatchesFor("", pending)).toEqual([]);
    expect(pendingMatchesFor("  ", pending)).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(names(pendingMatchesFor("l", pending, 1))).toEqual(["Leche"]);
  });
});

describe("addedQuantity", () => {
  it("adds up two lines in the same unit, or both without unit", () => {
    expect(
      addedQuantity({ quantity: 3, unit: null }, { quantity: 2, unit: null }),
    ).toEqual({ quantity: 5, unit: null });
    expect(
      addedQuantity({ quantity: 1, unit: "kg" }, { quantity: 0.5, unit: "kg" }),
    ).toEqual({ quantity: 1.5, unit: "kg" });
  });

  it("counts a line without quantity as one, as its price does", () => {
    expect(
      addedQuantity(
        { quantity: null, unit: null },
        { quantity: null, unit: null },
      ),
    ).toEqual({ quantity: 2, unit: null });
    expect(
      addedQuantity(
        { quantity: 3, unit: null },
        { quantity: null, unit: null },
      ),
    ).toEqual({ quantity: 4, unit: null });
  });

  it("puts a count word in plural from two up, in either form", () => {
    expect(
      addedQuantity(
        { quantity: 1, unit: "paquete" },
        { quantity: 1, unit: "paquete" },
      ),
    ).toEqual({ quantity: 2, unit: "paquetes" });
    expect(
      addedQuantity(
        { quantity: 2, unit: "latas" },
        { quantity: 1, unit: "lata" },
      ),
    ).toEqual({ quantity: 3, unit: "latas" });
  });

  it("does not add up different units", () => {
    expect(
      addedQuantity({ quantity: 2, unit: "kg" }, { quantity: 3, unit: null }),
    ).toBeNull();
    expect(
      addedQuantity({ quantity: 3, unit: null }, { quantity: 1, unit: "L" }),
    ).toBeNull();
    // Grams and kilos measure the same, but which unit would the sum keep?
    expect(
      addedQuantity({ quantity: 1, unit: "kg" }, { quantity: 500, unit: "g" }),
    ).toBeNull();
    expect(
      addedQuantity(
        { quantity: 1, unit: "lata" },
        { quantity: 1, unit: "caja" },
      ),
    ).toBeNull();
  });

  it("drops floating point noise, and stops at what the edit sheet accepts", () => {
    expect(
      addedQuantity(
        { quantity: 0.1, unit: "kg" },
        { quantity: 0.2, unit: "kg" },
      ),
    ).toEqual({ quantity: 0.3, unit: "kg" });
    expect(
      addedQuantity(
        { quantity: 99_999, unit: "g" },
        { quantity: 1, unit: "g" },
      ),
    ).toBeNull();
  });
});
