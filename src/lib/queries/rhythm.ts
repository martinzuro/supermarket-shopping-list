"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  listRhythmOf,
  productRhythmOf,
  type ListRhythm,
  type ProductRhythm,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import { unwrap } from "./errors";
import { queryKeys } from "./keys";

/**
 * Each product's rhythm and the list's, read from the trips (migration
 * catalog_rhythm, docs/improvements.md F-7): how often each product goes
 * through the checkout, and how often the cart is emptied. "Lo de siempre"
 * tells with it what is due from what is still at home.
 */
export type Rhythm = {
  /** By normalized name: the products bought at least once. */
  products: Readonly<Record<string, ProductRhythm>>;
  /** The list's trips; null before its first one. */
  list: ListRhythm | null;
};

async function fetchRhythm(listId: string): Promise<Rhythm> {
  const supabase = createClient();
  const [products, list] = await Promise.all([
    supabase
      .from("catalog_rhythm")
      .select("name_normalized, times_bought, last_bought_at, interval_days")
      .eq("list_id", listId),
    supabase
      .from("list_rhythm")
      .select("trips_count, interval_days")
      .eq("list_id", listId)
      .maybeSingle(),
  ]);
  const byName: Record<string, ProductRhythm> = {};
  for (const row of unwrap(products)) {
    // The views' columns are nullable to the types only (productRhythmOf).
    const rhythm = productRhythmOf(row);
    if (row.name_normalized !== null && rhythm !== null) {
      byName[row.name_normalized] = rhythm;
    }
  }
  return { products: byName, list: listRhythmOf(unwrap(list)) };
}

/**
 * The rhythm of the list's products, read with the catalog. The views are
 * not in Realtime: an emptying of the cart or its undo, here or by another
 * member, marks it to be read again (readRhythmAgain).
 */
export function useRhythm(userId: string | null, listId: string | null) {
  return useQuery({
    queryKey: queryKeys.rhythm(userId ?? "", listId ?? ""),
    queryFn: () => fetchRhythm(listId!),
    enabled: userId !== null && listId !== null,
  });
}

/** The trips changed: what the rhythm says may have too. */
export function readRhythmAgain(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.rhythm(userId, listId),
  });
}
