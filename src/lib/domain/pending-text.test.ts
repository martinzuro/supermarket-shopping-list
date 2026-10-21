import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/supabase/database.types";
import { normalizeName } from "./normalize-name";
import { canonicalUnit, parseItemInput } from "./parse-item-input";
import { pastedList, splitPastedList } from "./paste";
import { pendingText } from "./pending-text";

const NOW = "2026-10-21T00:00:00Z";
const LABELS = { heading: "Lo que falta:", uncategorized: "Sin categoría" };

function category(
  id: string,
  name: string,
  position: number,
  overrides: Partial<Tables<"categories">> = {},
): Tables<"categories"> {
  return {
    id,
    list_id: "list",
    name,
    position,
    is_default: true,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

let position = 0;

function item(
  name: string,
  categoryId: string | null,
  overrides: Partial<Tables<"items">> = {},
): Tables<"items"> {
  position += 1;
  return {
    id: `${name}-${position}`,
    list_id: "list",
    name,
    name_normalized: normalizeName(name),
    category_id: categoryId,
    checked: false,
    checked_at: null,
    created_at: NOW,
    created_by: null,
    currency: null,
    deleted_at: null,
    estimated_price: null,
    note: null,
    position,
    quantity: null,
    unit: null,
    updated_at: NOW,
    ...overrides,
  };
}

// Route order is position order, not the order of the array.
const categories = [
  category("c-dairy", "Fiambres y lácteos", 2),
  category("c-veg", "Frutas y verduras", 0),
  category("c-other", "Otros", 9),
  category("c-store", "Almacén", 4),
];

describe("pendingText", () => {
  it("groups what is pending by category, in route order", () => {
    const text = pendingText(
      [
        item("Yerba", "c-store"),
        item("Leche", "c-dairy"),
        item("Tomates", "c-veg"),
        item("Queso", "c-dairy"),
        item("Lechuga", "c-veg"),
      ],
      categories,
      LABELS,
    );
    expect(text).toBe(
      [
        "Lo que falta:",
        "",
        "*Frutas y verduras:*",
        "- Tomates",
        "- Lechuga",
        "",
        "*Fiambres y lácteos:*",
        "- Leche",
        "- Queso",
        "",
        "*Almacén:*",
        "- Yerba",
      ].join("\n"),
    );
  });

  it("follows the route when it changes", () => {
    const moved = categories.map((one) =>
      one.id === "c-store" ? { ...one, position: 1 } : one,
    );
    const text = pendingText(
      [item("Leche", "c-dairy"), item("Yerba", "c-store")],
      moved,
      LABELS,
    );
    expect(text.indexOf("*Almacén:*")).toBeLessThan(
      text.indexOf("*Fiambres y lácteos:*"),
    );
  });

  it("puts what has no category, or a category that is gone, in Otros", () => {
    const text = pendingText(
      [item("Pilas", null), item("Leche", "c-dairy"), item("Velas", "c-gone")],
      [...categories, category("c-gone", "Mascotas", 1, { deleted_at: NOW })],
      LABELS,
    );
    expect(text).toBe(
      [
        "Lo que falta:",
        "",
        "*Fiambres y lácteos:*",
        "- Leche",
        "",
        "*Otros:*",
        "- Pilas",
        "- Velas",
      ].join("\n"),
    );
  });

  it("names the group of a list without Otros with the label it is given", () => {
    const text = pendingText(
      [item("Pilas", null), item("Leche", "c-dairy")],
      categories.filter((one) => one.id !== "c-other"),
      LABELS,
    );
    expect(text).toContain(
      "*Fiambres y lácteos:*\n- Leche\n\n*Sin categoría:*",
    );
  });

  it("needs no category title for a single group", () => {
    expect(
      pendingText(
        [item("Tomates", null), item("Pilas", null)],
        categories,
        LABELS,
      ),
    ).toBe("Lo que falta:\n- Tomates\n- Pilas");
  });

  it("writes each amount as the add field reads it", () => {
    const text = pendingText(
      [
        item("Tomates", null, { quantity: 2, unit: "kg" }),
        item("Leche", null, { quantity: 1.5, unit: "L" }),
        item("Bananas", null, { quantity: 6 }),
        item("Pan", null, { quantity: 1.5 }),
        item("Fideos", null, { quantity: 2, unit: "paquetes" }),
        item("Jamón", null, { quantity: 1000, unit: "g" }),
        item("Huevos", null, { quantity: 12, unit: "unidades" }),
        item("Agua", null, { unit: "L" }),
        item("Yerba", null),
      ],
      categories,
      LABELS,
    );
    expect(text.split("\n").slice(1)).toEqual([
      "- Tomates 2 kg",
      "- Leche 1,5 L",
      "- Bananas ×6",
      "- Pan ×1,5",
      "- Fideos 2 paquetes",
      // No thousands separator: "1.000 g" would read as one gram.
      "- Jamón 1000 g",
      // "unidades" is a bare count.
      "- Huevos ×12",
      // A unit with no quantity says nothing.
      "- Agua",
      "- Yerba",
    ]);
  });

  it("writes the note last, in italics after an em dash, on one line", () => {
    const text = pendingText(
      [
        item("Leche", null, { quantity: 3, note: "descremada" }),
        item("Pan", null, { note: "  el de molde,\n  no el francés " }),
        item("Queso", null, { note: "   " }),
      ],
      categories,
      LABELS,
    );
    expect(text.split("\n").slice(1)).toEqual([
      "- Leche ×3 — _descremada_",
      "- Pan — _el de molde, no el francés_",
      "- Queso",
    ]);
  });

  it("leaves the cart and what was deleted out", () => {
    const text = pendingText(
      [
        item("Leche", null),
        item("Pan", null, { checked: true }),
        item("Yerba", null, { deleted_at: NOW }),
      ],
      categories,
      LABELS,
    );
    expect(text).toBe("Lo que falta:\n- Leche");
  });

  it("is empty when nothing is pending", () => {
    expect(pendingText([], categories, LABELS)).toBe("");
    expect(
      pendingText(
        [item("Pan", "c-store", { checked: true })],
        categories,
        LABELS,
      ),
    ).toBe("");
  });
});

/** What the add field would make of each product of a paste. */
function readBack(text: string) {
  return splitPastedList(text).map((product) => {
    const parsed = parseItemInput(product);
    return {
      name: normalizeName(parsed.name),
      quantity: parsed.quantity,
      unit: parsed.unit,
    };
  });
}

describe("pendingText pasted back (F-2)", () => {
  const items = [
    item("Yerba Canarias", "c-store", { quantity: 1, unit: "kg" }),
    item("Leche", "c-dairy", {
      quantity: 3,
      note: "descremada, la de caja; no sachet",
    }),
    item("Tomates", "c-veg", { quantity: 2.5, unit: "kg" }),
    item("Queso dambo", "c-dairy", { quantity: 500, unit: "g" }),
    item("Pan", null, { quantity: 1.5, note: "el de molde" }),
    item("Fideos moñitos", "c-store", { quantity: 2, unit: "paquetes" }),
    item("Agua", "c-store", { quantity: 6, unit: "botellas" }),
    item("Coca Zero 2,25", "c-store", { quantity: 2 }),
    item("Pañales talle 3", null, { note: "los de Pampers" }),
    item("Lavandina", null),
    item("Bananas", "c-veg", { checked: true }),
  ];

  it("gives back the same products, with the same amounts", () => {
    const pending = items.filter((one) => !one.checked);
    const text = pendingText(items, categories, LABELS);

    expect(pastedList(text)?.products).toHaveLength(pending.length);
    expect(readBack(text).sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      pending
        .map((one) => ({
          name: normalizeName(one.name),
          quantity: one.quantity,
          unit: one.unit === null ? null : canonicalUnit(one.unit),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  });

  it("gives them back in route order", () => {
    expect(
      readBack(pendingText(items, categories, LABELS)).map((one) => one.name),
    ).toEqual(
      [
        "Tomates",
        "Leche",
        "Queso dambo",
        "Yerba Canarias",
        "Fideos moñitos",
        "Agua",
        "Coca Zero 2,25",
        "Pan",
        "Pañales talle 3",
        "Lavandina",
      ].map(normalizeName),
    );
  });

  it("brings a unit the parser does not know back as one product", () => {
    const text = pendingText(
      [item("Leche", null, { quantity: 2, unit: "sachet" }), item("Pan", null)],
      categories,
      LABELS,
    );
    expect(splitPastedList(text)).toEqual(["Leche 2 sachet", "Pan"]);
  });
});
