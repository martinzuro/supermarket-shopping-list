import type { CategoryId } from "@/lib/design/tokens";
import type { Tables } from "@/lib/supabase/database.types";
import { normalizeName } from "./normalize-name";

type Item = Tables<"items">;
type Category = Tables<"categories">;
type CatalogEntry = Pick<
  Tables<"catalog">,
  "name_normalized" | "last_category_id"
>;

// The ten default categories, by normalized name, as the lists_after_insert
// trigger seeds them. They give each category its tint and icon.
const KINDS: Record<string, CategoryId> = {
  "frutas y verduras": "verduras",
  "carnes y pescados": "carnes",
  "fiambres y lacteos": "lacteos",
  panaderia: "panaderia",
  almacen: "almacen",
  bebidas: "bebidas",
  congelados: "congelados",
  limpieza: "limpieza",
  higiene: "higiene",
  otros: "otros",
};

/** Tint and icon of a category. Any other category looks like "otros". */
export function categoryKind(category: Pick<Category, "name">): CategoryId {
  return KINDS[normalizeName(category.name)] ?? "otros";
}

/**
 * The "Otros" category of the list, where items without category are shown.
 * By name, not by kind: any custom category also looks like "otros".
 */
export function fallbackCategory<C extends Category>(
  categories: readonly C[],
): C | null {
  return (
    categories.find(
      (category) =>
        category.deleted_at == null && normalizeName(category.name) === "otros",
    ) ?? null
  );
}

/**
 * Category for a new item: the one the catalog remembers for that product,
 * if it still exists, or null, which the list shows under "Otros". Not the
 * Otros id itself: the catalog trigger would then remember "Otros" as if it
 * had been chosen, and a later remembered category could be overwritten.
 */
export function suggestCategory(
  name: string,
  catalog: readonly CatalogEntry[],
  categories: readonly Category[],
): string | null {
  const key = normalizeName(name);
  const remembered = catalog.find(
    (entry) => entry.name_normalized === key,
  )?.last_category_id;
  const live = categories.find(
    (category) => category.id === remembered && category.deleted_at == null,
  );
  return live?.id ?? null;
}

export type ItemGroup<I extends Item = Item, C extends Category = Category> = {
  /** null only when the list has no "Otros" to take orphans. */
  category: C | null;
  items: I[];
};

/**
 * Groups the given items (already the ones to show, for example the pending
 * ones) by category, in route order, each group in item position order.
 * Items without category, or whose category is gone, go to "Otros"; only if
 * the list has no "Otros", to a last group without category. Empty groups are
 * left out: a category with nothing to buy takes no room.
 */
export function groupByCategory<I extends Item, C extends Category>(
  items: readonly I[],
  categories: readonly C[],
): ItemGroup<I, C>[] {
  const live = categories
    .filter((category) => category.deleted_at == null)
    .sort((a, b) => a.position - b.position);
  const fallback = fallbackCategory(live);
  const byId = new Map(live.map((category) => [category.id, category]));
  const buckets = new Map<C | null, I[]>();
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    const category =
      (item.category_id == null ? undefined : byId.get(item.category_id)) ??
      fallback;
    const bucket = buckets.get(category);
    if (bucket) bucket.push(item);
    else buckets.set(category, [item]);
  }
  const groups: ItemGroup<I, C>[] = [];
  for (const category of live) {
    const groupItems = buckets.get(category);
    if (groupItems) groups.push({ category, items: groupItems });
  }
  const orphans = buckets.get(null);
  if (orphans) groups.push({ category: null, items: orphans });
  return groups;
}
