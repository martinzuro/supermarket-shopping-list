import type { Tables } from "@/lib/supabase/database.types";

type Item = Tables<"items">;
type Category = Tables<"categories">;

export type CategoryGroup<
  I extends Item = Item,
  C extends Category = Category,
> = {
  category: C | null;
  items: I[];
};

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

// Groups pending items by category, in the category `position` order (the
// supermarket route). Soft-deleted categories are dropped; their items, and
// items without category, go last under a null group. Categories without
// pending items are kept (empty); the null group only appears if non-empty.
export function groupItemsByCategory<I extends Item, C extends Category>(
  items: readonly I[],
  categories: readonly C[],
): CategoryGroup<I, C>[] {
  const { pending } = splitByChecked(items);
  const result: CategoryGroup<I, C>[] = categories
    .filter((category) => category.deleted_at == null)
    .sort((a, b) => a.position - b.position)
    .map((category) => ({ category, items: [] }));
  const byId = new Map(result.map((group) => [group.category?.id, group]));
  const uncategorized: I[] = [];
  for (const item of pending) {
    const group =
      item.category_id == null ? undefined : byId.get(item.category_id);
    (group?.items ?? uncategorized).push(item);
  }
  if (uncategorized.length > 0)
    result.push({ category: null, items: uncategorized });
  return result;
}
