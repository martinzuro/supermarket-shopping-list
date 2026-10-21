"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { unwrap } from "./errors";
import type { Item } from "./items";
import { queryKeys } from "./keys";

/**
 * How many past trips the history shows: some five months of weekly
 * shopping. Every trip is kept; only the last ones are read.
 */
export const TRIP_LIMIT = 20;

/**
 * An emptying of the cart (docs/improvements.md, F-4), with the rows it
 * archived, as they were when they went through the checkout.
 */
export type Trip = Pick<Tables<"trips">, "id" | "emptied_at"> & {
  items: Item[];
};

export type TripHistory = {
  /** The last TRIP_LIMIT trips, newest first. */
  trips: Trip[];
  /** There are older ones too, not shown. */
  more: boolean;
};

async function fetchTrips(listId: string): Promise<TripHistory> {
  const rows = unwrap(
    await createClient()
      .from("trips")
      // The rows by the trip's foreign key, not the list's: both tables
      // point to lists.
      .select("id, emptied_at, items!items_trip_id_fkey(*)")
      .eq("list_id", listId)
      .is("deleted_at", null)
      .order("emptied_at", { ascending: false })
      .order("id", { ascending: false })
      // One more than shown, to know whether there are older ones.
      .limit(TRIP_LIMIT + 1),
  );
  return { trips: rows.slice(0, TRIP_LIMIT), more: rows.length > TRIP_LIMIT };
}

/**
 * The list's past trips, read each time the history is shown (staleTime 0):
 * trips are not in the Realtime publication, so another member's emptying
 * shows up with the next read. One's own emptying, and its undo, mark it to
 * be read again (useEmptyCart, useRestoreCart).
 */
export function useTrips(userId: string | null, listId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips(userId ?? "", listId ?? ""),
    queryFn: () => fetchTrips(listId!),
    enabled: userId !== null && listId !== null,
    staleTime: 0,
  });
}
