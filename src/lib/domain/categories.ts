import type { CategoryId } from "@/lib/design/tokens";
import type { Tables } from "@/lib/supabase/database.types";
import { normalizeName } from "./normalize-name";
import { compareTimestamps } from "./timestamps";

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

/**
 * Route order, the walk through the supermarket: position, then creation
 * time, then id, as the server reads it (move_category, fetchCategories).
 * Positions are 0..n-1 after any move, but a list may hold ties before its
 * first one.
 */
export function compareRouteOrder(a: Category, b: Category): number {
  return (
    a.position - b.position ||
    compareTimestamps(a.created_at, b.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export type Direction = "up" | "down";

function liveRoute<C extends Category>(categories: readonly C[]): C[] {
  return categories
    .filter((category) => category.deleted_at == null)
    .sort(compareRouteOrder);
}

/**
 * The live category next to this one along the route, above it ('up', towards
 * the start) or below it: the one a step in that direction moves it past.
 * Null at that end of the route, or when the category is not a live one.
 */
export function adjacentCategory<C extends Category>(
  categories: readonly C[],
  id: string,
  direction: Direction,
): C | null {
  const route = liveRoute(categories);
  const here = route.findIndex((category) => category.id === id);
  if (here === -1) return null;
  return route[direction === "up" ? here - 1 : here + 1] ?? null;
}

/**
 * The categories after moving one up past another (it ends right before it)
 * or down past it (right after it), as public.move_category does it on the
 * server, and the live ones renumbered 0..n-1 in route order. Moving past the
 * adjacent category is a swap; moving past where it already is changes
 * nothing, so a move sent twice moves once. Soft-deleted categories stay as
 * they are, after the live ones. Null when nothing changes: either category
 * is not a live one, they are the same, or it is already in that place.
 */
export function moveCategory<C extends Category>(
  categories: readonly C[],
  id: string,
  direction: Direction,
  pastId: string,
): C[] | null {
  const route = liveRoute(categories);
  const moving = route.find((category) => category.id === id);
  if (!moving || id === pastId) return null;
  const rest = route.filter((category) => category !== moving);
  const past = rest.findIndex((category) => category.id === pastId);
  if (past === -1) return null;
  rest.splice(direction === "up" ? past : past + 1, 0, moving);
  if (rest.every((category, position) => category === route[position])) {
    return null;
  }
  return [
    ...rest.map((category, position) =>
      category.position === position ? category : { ...category, position },
    ),
    ...categories.filter((category) => category.deleted_at != null),
  ];
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
    .sort(compareRouteOrder);
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

/**
 * Catalog products in route order, by the category the catalog remembers for
 * each, as Pendientes would show them: a product without category, or whose
 * category is gone, goes where "Otros" is (last, if the list has none). The
 * order within a category is the one given.
 */
export function inRouteOrder<
  E extends Pick<CatalogEntry, "last_category_id">,
  C extends Category,
>(entries: readonly E[], categories: readonly C[]): E[] {
  const live = categories
    .filter((category) => category.deleted_at == null)
    .sort(compareRouteOrder);
  const rank = new Map(live.map((category, index) => [category.id, index]));
  const fallback = fallbackCategory(live);
  const last = fallback ? (rank.get(fallback.id) ?? live.length) : live.length;
  const place = (entry: E) =>
    (entry.last_category_id == null
      ? undefined
      : rank.get(entry.last_category_id)) ?? last;
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => place(a.entry) - place(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);
}
