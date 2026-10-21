import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/supabase/database.types";
import { compareServerOrder, splitByChecked } from "./order";

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
    trip_id: null,
    estimated_price: null,
    note: null,
    position: 0,
    quantity: null,
    unit: null,
    updated_at: NOW,
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

describe("compareServerOrder", () => {
  it("orders by position, then creation time, then id", () => {
    const items = [
      makeItem("d", { position: 1 }),
      makeItem("c", { position: 0, created_at: "2026-10-17T00:00:01Z" }),
      makeItem("b", { position: 0 }),
      makeItem("a", { position: 0 }),
    ];
    expect([...items].sort(compareServerOrder).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
