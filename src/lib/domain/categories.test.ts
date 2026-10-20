import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/supabase/database.types";
import {
  adjacentCategory,
  categoryKind,
  compareRouteOrder,
  fallbackCategory,
  groupByCategory,
  moveCategory,
  suggestCategory,
} from "./categories";

const NOW = "2026-10-18T00:00:00Z";

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

function item(
  id: string,
  categoryId: string | null,
  position: number,
): Tables<"items"> {
  return {
    id,
    list_id: "list",
    name: id,
    name_normalized: id,
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
  };
}

const verduras = category("c-veg", "Frutas y verduras", 0);
const lacteos = category("c-dairy", "Fiambres y lácteos", 2);
const limpieza = category("c-clean", "Limpieza", 7);
const otros = category("c-other", "Otros", 9);
const categories = [otros, limpieza, verduras, lacteos];

describe("categoryKind", () => {
  it.each([
    ["Frutas y verduras", "verduras"],
    ["Carnes y pescados", "carnes"],
    ["Fiambres y lácteos", "lacteos"],
    ["FIAMBRES Y LACTEOS", "lacteos"],
    ["Panadería", "panaderia"],
    ["Almacén", "almacen"],
    ["Bebidas", "bebidas"],
    ["Congelados", "congelados"],
    ["Limpieza", "limpieza"],
    ["Higiene", "higiene"],
    ["Otros", "otros"],
    ["Mascotas", "otros"],
  ])("%j is %j", (name, kind) => {
    expect(categoryKind({ name })).toBe(kind);
  });
});

describe("fallbackCategory", () => {
  it("is the list's Otros", () => {
    expect(fallbackCategory(categories)).toBe(otros);
  });

  it("is the one named Otros, not another category that looks like it", () => {
    const custom = category("c-pets", "Mascotas", 8, { is_default: false });
    expect(fallbackCategory([custom, otros])).toBe(otros);
  });

  it("skips a deleted Otros", () => {
    expect(
      fallbackCategory([verduras, { ...otros, deleted_at: NOW }]),
    ).toBeNull();
  });
});

describe("suggestCategory", () => {
  const catalog = [
    { name_normalized: "tomates", last_category_id: "c-veg" },
    { name_normalized: "lavandina", last_category_id: "c-gone" },
    { name_normalized: "yerba", last_category_id: null },
  ];

  it("uses the category the catalog remembers, matching the normalized name", () => {
    expect(suggestCategory("  Tomates ", catalog, categories)).toBe("c-veg");
  });

  it.each([
    ["a product the catalog does not know", "Pan"],
    ["a remembered category that no longer exists", "Lavandina"],
    ["a catalog entry without category", "Yerba"],
  ])("is null (shown under Otros) for %s", (_label, name) => {
    expect(suggestCategory(name, catalog, categories)).toBeNull();
  });
});

describe("groupByCategory", () => {
  it("groups in route order, items by position, and leaves empty categories out", () => {
    const groups = groupByCategory(
      [
        item("lavandina", "c-clean", 3),
        item("yogur", "c-dairy", 2),
        item("tomates", "c-veg", 4),
        item("lechuga", "c-veg", 1),
      ],
      categories,
    );
    expect(
      groups.map((g) => [g.category?.id, g.items.map((i) => i.id)]),
    ).toEqual([
      ["c-veg", ["lechuga", "tomates"]],
      ["c-dairy", ["yogur"]],
      ["c-clean", ["lavandina"]],
    ]);
  });

  it("puts items without category, or with a deleted one, in Otros", () => {
    const groups = groupByCategory(
      [
        item("pan", null, 0),
        item("raro", "c-gone", 1),
        item("tomates", "c-veg", 2),
      ],
      [...categories, category("c-gone", "Mascotas", 5, { deleted_at: NOW })],
    );
    expect(
      groups.map((g) => [g.category?.id, g.items.map((i) => i.id)]),
    ).toEqual([
      ["c-veg", ["tomates"]],
      ["c-other", ["pan", "raro"]],
    ]);
  });

  it("uses a last group without category when the list has no Otros", () => {
    const groups = groupByCategory(
      [item("pan", null, 0), item("tomates", "c-veg", 1)],
      [verduras],
    );
    expect(groups.map((g) => g.category?.id ?? null)).toEqual(["c-veg", null]);
  });

  it("returns nothing for no items", () => {
    expect(groupByCategory([], categories)).toEqual([]);
  });
});

describe("compareRouteOrder", () => {
  it("orders by position, then creation time, then id", () => {
    const later = "2026-10-18T00:00:01Z";
    const sorted = [
      category("b", "Bebidas", 1),
      category("z", "Mascotas", 0, { created_at: later }),
      category("y", "Limpieza", 0),
      category("a", "Almacén", 0),
    ].sort(compareRouteOrder);
    expect(sorted.map((c) => c.id)).toEqual(["a", "y", "z", "b"]);
  });
});

describe("adjacentCategory", () => {
  const route = [
    category("c-dairy", "Fiambres y lácteos", 2),
    category("c-veg", "Frutas y verduras", 0),
    category("c-gone", "Mascotas", 1, { deleted_at: NOW }),
    category("c-other", "Otros", 3),
  ];

  it("is the live category above or below, in route order", () => {
    expect(adjacentCategory(route, "c-dairy", "up")?.id).toBe("c-veg");
    expect(adjacentCategory(route, "c-dairy", "down")?.id).toBe("c-other");
  });

  it.each([
    ["the first one, up", "c-veg", "up"],
    ["the last one, down", "c-other", "down"],
    ["a soft-deleted one", "c-gone", "up"],
    ["one that is not there", "c-nope", "down"],
  ] as const)("is null for %s", (_label, id, direction) => {
    expect(adjacentCategory(route, id, direction)).toBeNull();
  });
});

describe("moveCategory", () => {
  const route = [
    category("c-veg", "Frutas y verduras", 0),
    category("c-meat", "Carnes y pescados", 1),
    category("c-dairy", "Fiambres y lácteos", 2),
    category("c-other", "Otros", 3),
  ];
  const order = (categories: Tables<"categories">[] | null) =>
    categories?.map((c) => `${c.position}:${c.id}`);

  it("swaps a category with the one above it and renumbers the route", () => {
    expect(order(moveCategory(route, "c-dairy", "up", "c-meat"))).toEqual([
      "0:c-veg",
      "1:c-dairy",
      "2:c-meat",
      "3:c-other",
    ]);
  });

  it("swaps a category with the one below it", () => {
    expect(order(moveCategory(route, "c-veg", "down", "c-meat"))).toEqual([
      "0:c-meat",
      "1:c-veg",
      "2:c-dairy",
      "3:c-other",
    ]);
  });

  it("puts it right before or after a category further away", () => {
    expect(order(moveCategory(route, "c-other", "up", "c-meat"))).toEqual([
      "0:c-veg",
      "1:c-other",
      "2:c-meat",
      "3:c-dairy",
    ]);
    expect(order(moveCategory(route, "c-veg", "down", "c-dairy"))).toEqual([
      "0:c-meat",
      "1:c-dairy",
      "2:c-veg",
      "3:c-other",
    ]);
  });

  it("moves once when the same move comes twice", () => {
    const once = moveCategory(route, "c-dairy", "up", "c-meat")!;
    expect(moveCategory(once, "c-dairy", "up", "c-meat")).toBeNull();
  });

  it("keeps the rows whose position does not change", () => {
    const moved = moveCategory(route, "c-dairy", "up", "c-meat")!;
    expect(moved[0]).toBe(route[0]);
    expect(moved[3]).toBe(route[3]);
  });

  it.each([
    ["a category that is not there", "c-gone", "c-veg"],
    ["moving past a category that is not there", "c-veg", "c-gone"],
    ["moving past itself", "c-veg", "c-veg"],
  ] as const)("changes nothing for %s", (_label, id, past) => {
    expect(moveCategory(route, id, "up", past)).toBeNull();
  });

  it("follows the route order the server uses, ties included, from any input order", () => {
    const tied = [
      category("b", "Bebidas", 0),
      category("a", "Almacén", 0),
      category("c", "Congelados", 1),
    ];
    // Route: a, b, c (the tie on position 0 goes by id).
    expect(order(moveCategory([...tied].reverse(), "c", "up", "b"))).toEqual([
      "0:a",
      "1:c",
      "2:b",
    ]);
  });

  it("skips soft-deleted categories and leaves them as they are", () => {
    const gone = category("c-gone", "Mascotas", 2, { deleted_at: NOW });
    const withGone = [route[0], route[1], gone, route[2], route[3]];
    expect(order(moveCategory(withGone, "c-dairy", "up", "c-meat"))).toEqual([
      "0:c-veg",
      "1:c-dairy",
      "2:c-meat",
      "3:c-other",
      "2:c-gone",
    ]);
    expect(moveCategory(withGone, "c-gone", "up", "c-veg")).toBeNull();
    expect(moveCategory(withGone, "c-veg", "down", "c-gone")).toBeNull();
  });
});
