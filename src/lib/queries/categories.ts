"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { unwrap } from "./errors";
import { queryKeys } from "./keys";

export type Category = Tables<"categories">;
export type CatalogEntry = Pick<
  Tables<"catalog">,
  "name_normalized" | "last_category_id"
>;

async function fetchCategories(listId: string): Promise<Category[]> {
  return unwrap(
    await createClient()
      .from("categories")
      .select("*")
      .eq("list_id", listId)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
  );
}

/** The list's categories in route order (the walk through the supermarket). */
export function useCategories(userId: string | null, listId: string | null) {
  return useQuery({
    queryKey: queryKeys.categories(userId ?? "", listId ?? ""),
    queryFn: () => fetchCategories(listId!),
    enabled: userId !== null && listId !== null,
  });
}

async function fetchCatalog(listId: string): Promise<CatalogEntry[]> {
  return unwrap(
    await createClient()
      .from("catalog")
      .select("name_normalized, last_category_id")
      .eq("list_id", listId),
  );
}

/**
 * What the list remembers of every product ever added (written by the items
 * triggers). Read here only to put a new item in its usual category at once.
 */
export function useCatalog(userId: string | null, listId: string | null) {
  return useQuery({
    queryKey: queryKeys.catalog(userId ?? "", listId ?? ""),
    queryFn: () => fetchCatalog(listId!),
    enabled: userId !== null && listId !== null,
  });
}
