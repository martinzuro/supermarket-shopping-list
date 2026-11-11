"use client";

import { useEffect, useMemo } from "react";
import { useShoppingLine } from "@/components/list/shopping-mode";
import {
  CHECKOUT,
  groupByCategory,
  moveTo,
  nextStop,
  pendingIn,
  reconcileLine,
  startOf,
  type ItemGroup,
  type LineItem,
  type LinePosition,
} from "@/lib/domain";
import {
  useCategories,
  useItems,
  type Category,
  type Item,
} from "@/lib/queries";

/** Station id of the items without category (a list without "Otros"). */
export const NO_CATEGORY = "none";

export type Station = {
  id: string;
  /** null only for the group without category. */
  category: Category | null;
  /** Everything of the station on this trip, in the list's order. */
  items: readonly Item[];
  pending: number;
};

export type Line = {
  /** The stations of this trip, in route order. */
  stations: readonly Station[];
  position: LinePosition;
  /** The station you are at; null at the checkout. */
  here: Station | null;
  /** The next stop ahead with something to pick, or CHECKOUT. */
  next: string;
  move: (to: string) => void;
};

const stationId = (group: ItemGroup<Item, Category>) =>
  group.category?.id ?? NO_CATEGORY;

/**
 * The supermarket line of the list being shopped (F-9, ADR 0010): its
 * stations from the live data, and where this device is on it. Null until
 * the items and the categories are in, while this device is not shopping,
 * and when the categories could not be loaded (useLineFailed).
 *
 * The position is derived on every render from the kept one and the line of
 * now (someone may have added to a category that had nothing, or removed a
 * station's last item), and kept again when it changed. The list and the add
 * bar both read it from here: they are siblings in the page.
 */
export function useLine(
  userId: string | null,
  listId: string | null,
  shopping: boolean,
): Line | null {
  const items = useItems(userId, listId);
  const categories = useCategories(userId, listId);
  const [kept, keep] = useShoppingLine(shopping ? listId : null);
  const ready =
    shopping &&
    listId !== null &&
    items.data !== undefined &&
    // Without the categories there are no stations to keep a place in: if
    // their load failed, the list shows its sections as before (lineFailed).
    categories.data !== undefined;

  const line = useMemo(() => {
    if (!ready) return null;
    const live = (items.data ?? []).filter((item) => item.deleted_at == null);
    const groups = groupByCategory(live, categories.data ?? []);
    const lineItems: LineItem[] = groups.flatMap((group) =>
      group.items.map((item) => ({
        station: stationId(group),
        checked: item.checked,
      })),
    );
    const stations: Station[] = groups.map((group) => ({
      id: stationId(group),
      category: group.category,
      items: group.items,
      pending: pendingIn(lineItems, stationId(group)),
    }));
    const ids = stations.map((station) => station.id);
    const position: LinePosition = kept
      ? reconcileLine(kept.stations, ids, {
          at: kept.at,
          passed: kept.passed,
        })
      : startOf(ids, lineItems);
    return { stations, ids, lineItems, position };
  }, [ready, items.data, categories.data, kept]);

  // Kept with the trip (shopping-mode.ts); the same line is not written twice.
  useEffect(() => {
    if (line === null) return;
    keep({
      at: line.position.at,
      passed: line.position.passed,
      stations: line.ids,
    });
  }, [line, keep]);

  return useMemo(() => {
    if (line === null) return null;
    const { stations, ids, lineItems, position } = line;
    return {
      stations,
      position,
      here:
        position.at === CHECKOUT
          ? null
          : (stations.find((station) => station.id === position.at) ?? null),
      next: nextStop(ids, lineItems, position),
      move: (to: string) => {
        const moved = moveTo(ids, position, to);
        keep({ at: moved.at, passed: moved.passed, stations: ids });
      },
    };
  }, [line, keep]);
}

/**
 * The categories could not be loaded, so there is no line: the list shows
 * its sections and the bar its "Terminé", as before F-9, instead of waiting
 * for a line that is not coming.
 */
export function useLineFailed(userId: string | null, listId: string | null) {
  const categories = useCategories(userId, listId);
  return categories.data === undefined && categories.isError;
}
