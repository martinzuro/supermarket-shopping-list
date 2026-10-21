"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import {
  showAdded,
  useAddSeveral,
  type SeveralAdded,
} from "@/components/list/add-several";
import {
  ReviewSheet,
  type ReviewProduct,
} from "@/components/list/review-sheet";
import type { NamedTrip } from "@/components/menu/trips-section";
import { useSession } from "@/components/session-provider";
import {
  categoryKind,
  findPending,
  formatQuantity,
  rememberedPrice,
  tripAgain,
} from "@/lib/domain";
import {
  currentListOf,
  newItem,
  useCatalog,
  useCategories,
  useItems,
  useLists,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

type TripReviewProps = {
  /** The trip to add again; the review keeps it while it closes. */
  named: NamedTrip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The sheet is gone: after "Agregar" (`answered`), or closed without it.
   * Radix has no trigger to give the focus back to: the menu decides.
   */
  onClosed: (answered: boolean) => void;
};

/**
 * "Agregar de nuevo" for a past trip (docs/improvements.md, F-4): the review
 * sheet of "Lo de siempre" and of a pasted list, with the trip's products in
 * the order of the route, all ticked, each with the quantity it was bought
 * in. What is pending already shows as "Ya está en la lista" and is not
 * added again (A-2). The rest goes in one write, with the category and the
 * price the catalog remembers, as any add, and the add bar says so with its
 * "Deshacer" once the sheet is gone (add-several.ts). Mounted anew for each
 * opening (the menu keys it), so each starts unanswered.
 */
export function TripReview({
  named,
  open,
  onOpenChange,
  onClosed,
}: TripReviewProps) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const listId = currentListOf(useLists(userId).data)?.id ?? null;
  const items = useItems(userId, listId);
  const categories = useCategories(userId, listId);
  const catalog = useCatalog(userId, listId);
  const addSeveral = useAddSeveral(userId ?? "", listId ?? "");
  // As the bar's own review: the positions come from the items, and the
  // category from the catalog (if either fails to load, the products go
  // without category).
  const ready =
    items.data !== undefined &&
    (categories.data !== undefined || categories.isError) &&
    (catalog.data !== undefined || catalog.isError);
  // "Agregar" was tapped: a second tap while the sheet leaves (it stays on
  // screen for its exit) adds nothing.
  const answered = useRef(false);
  // What the add put on the list, told once the sheet is gone.
  const added = useRef<SeveralAdded | null>(null);

  const pending = useMemo(
    () =>
      (items.data ?? []).filter(
        (item) => item.deleted_at == null && !item.checked,
      ),
    [items.data],
  );
  const again = useMemo(
    () =>
      named
        ? tripAgain(named.trip.items, catalog.data ?? [], categories.data ?? [])
        : [],
    [named, catalog.data, categories.data],
  );
  const products = useMemo<ReviewProduct[]>(
    () =>
      again.map((item) => {
        const category = categories.data?.find(
          (one) => one.id === item.category_id,
        );
        return {
          key: item.name_normalized,
          name: item.name,
          category: category ? categoryKind(category) : "otros",
          amount: formatQuantity(item.quantity, item.unit),
          inList: findPending(item.name, pending) !== undefined,
        };
      }),
    [again, categories.data, pending],
  );

  /** What is ticked and not pending, in the order of the sheet. */
  function add(keys: readonly string[]) {
    if (answered.current) return;
    answered.current = true;
    onOpenChange(false);
    if (!ready) return;
    const chosen = new Set(keys);
    added.current = addSeveral(
      again
        .filter((item) => chosen.has(item.name_normalized))
        .filter((item) => !findPending(item.name, pending))
        .map((item) =>
          newItem(item.name, {
            quantity: item.quantity,
            unit: item.unit,
            categoryId: item.category_id,
            price: rememberedPrice(item.name, catalog.data ?? [], item.unit),
          }),
        ),
    );
  }

  return (
    <ReviewSheet
      open={open}
      onOpenChange={onOpenChange}
      title={named?.name ?? ""}
      description={texts.trips.review.description}
      listLabel={texts.trips.review.listLabel}
      products={products}
      onAdd={add}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const told = added.current;
        added.current = null;
        if (told) showAdded(queryClient, told);
        onClosed(answered.current);
      }}
    />
  );
}
