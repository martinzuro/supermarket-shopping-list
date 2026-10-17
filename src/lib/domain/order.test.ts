import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/supabase/database.types";
import { groupItemsByCategory, splitByChecked } from "./order";

const NOW = "2026-10-17T00:00:00Z";

function makeItem(
  id: string,
  overrides: Partial<Tables<"items">> = {},
): Tables<"items"> {
  return {
    id,
    list_id: "list",
    name: id,
    name_normalized: id,
    category_id: null,
    checked: false,
    checked_at: null,
    created_at: NOW,
    created_by: null,
    currency: null,
    deleted_at: null,
    estimated_price: null,
    note: null,
    position: 0,
    quantity: null,
    unit: null,
    updated_at: NOW,
    ...overrides,
  };
}

function makeCategory(
  id: string,
  position: number,
  overrides: Partial<Tables<"categories">> = {},
): Tables<"categories"> {
  return {
    id,
    list_id: "list",
    name: id,
    position,
    is_default: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

describe("splitByChecked", () => {
  it("splits pending and cart", () => {
    const { pending, cart } = splitByChecked([
      makeItem("a"),
      makeItem("b", { checked: true }),
      makeItem("c"),
    ]);
    expect(pending.map((i) => i.id)).toEqual(["a", "c"]);
    expect(cart.map((i) => i.id)).toEqual(["b"]);
  });

  it("excludes soft-deleted items from both", () => {
    const { pending, cart } = splitByChecked([
      makeItem("a", { deleted_at: NOW }),
      makeItem("b", { checked: true, deleted_at: NOW }),
      makeItem("c"),
    ]);
    expect(pending.map((i) => i.id)).toEqual(["c"]);
    expect(cart).toEqual([]);
  });

  it("orders by position without mutating the input", () => {
    const items = [
      makeItem("a", { position: 2 }),
      makeItem("b", { position: 1 }),
    ];
    expect(splitByChecked(items).pending.map((i) => i.id)).toEqual(["b", "a"]);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(splitByChecked([])).toEqual({ pending: [], cart: [] });
  });
});

describe("groupItemsByCategory", () => {
  const dairy = makeCategory("dairy", 2);
  const fruit = makeCategory("fruit", 1);

  it("orders categories by position and fills them with pending items", () => {
    const groups = groupItemsByCategory(
      [
        makeItem("milk", { category_id: "dairy", position: 1 }),
        makeItem("apple", { category_id: "fruit", position: 2 }),
        makeItem("pear", { category_id: "fruit", position: 1 }),
      ],
      [dairy, fruit],
    );
    expect(groups.map((g) => g.category?.id)).toEqual(["fruit", "dairy"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["pear", "apple"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["milk"]);
  });

  it("puts items without category last under a null group", () => {
    const groups = groupItemsByCategory(
      [makeItem("loose"), makeItem("apple", { category_id: "fruit" })],
      [fruit],
    );
    expect(groups.map((g) => g.category?.id ?? null)).toEqual(["fruit", null]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["loose"]);
  });

  it("omits the null group when empty and keeps empty categories", () => {
    const groups = groupItemsByCategory(
      [makeItem("apple", { category_id: "fruit" })],
      [fruit, dairy],
    );
    expect(groups.map((g) => g.category?.id)).toEqual(["fruit", "dairy"]);
    expect(groups[1].items).toEqual([]);
  });

  it("excludes checked and soft-deleted items", () => {
    const groups = groupItemsByCategory(
      [
        makeItem("a", { category_id: "fruit", checked: true }),
        makeItem("b", { category_id: "fruit", deleted_at: NOW }),
        makeItem("c", { category_id: "fruit" }),
      ],
      [fruit],
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("moves items of deleted or unknown categories to the null group", () => {
    const groups = groupItemsByCategory(
      [
        makeItem("a", { category_id: "gone" }),
        makeItem("b", { category_id: "ghost" }),
      ],
      [makeCategory("gone", 1, { deleted_at: NOW })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBeNull();
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for empty input", () => {
    expect(groupItemsByCategory([], [])).toEqual([]);
  });
});
