import type { Tables } from "@/lib/supabase/database.types";
import { compareTimestamps } from "./timestamps";

type Item = Tables<"items">;

// Splits live (not soft-deleted) items into pending and in-cart, each ordered
// by position.
export function splitByChecked<I extends Item>(
  items: readonly I[],
): { pending: I[]; cart: I[] } {
  const live = items
    .filter((item) => item.deleted_at == null)
    .sort((a, b) => a.position - b.position);
  return {
    pending: live.filter((item) => !item.checked),
    cart: live.filter((item) => item.checked),
  };
}

// The order the server reads the list in (src/lib/queries/items.ts,
// fetchItems): position, then creation time, then id. Two members adding at
// once can write the same position.
export function compareServerOrder(a: Item, b: Item): number {
  return (
    a.position - b.position ||
    compareTimestamps(a.created_at, b.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
