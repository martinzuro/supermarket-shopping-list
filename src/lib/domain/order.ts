import type { Tables } from "@/lib/supabase/database.types";

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
