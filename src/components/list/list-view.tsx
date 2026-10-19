"use client";

import { useIsMutating } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditItemSheet } from "@/components/list/edit-item-sheet";
import { ListSection } from "@/components/list/list-section";
import { Enter, transitions } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { motionTokens } from "@/lib/design/motion";
import { formatQuantity, splitByChecked } from "@/lib/domain";
import {
  queryKeys,
  useCurrentList,
  useEditItem,
  useItems,
  useRemoveItem,
  useToggleItem,
  type Item,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

type Place = "pending" | "cart";

/**
 * Ids of the items that appeared since the previous render with data. The
 * first load is the baseline (nothing is new), so rows already on the list
 * do not all animate in. A row that only moves between sections keeps its id
 * and is not new either: it travels through the shared layout instead.
 * Derived during render (React's "adjust state on change" pattern), so the
 * rows see it in the same pass that mounts them.
 */
function useFreshIds(items: Item[] | undefined) {
  const [state, setState] = useState<{
    ids: ReadonlySet<string>;
    fresh: ReadonlySet<string>;
  } | null>(null);

  if (items) {
    const unchanged =
      state !== null &&
      state.ids.size === items.length &&
      items.every((item) => state.ids.has(item.id));
    if (!unchanged) {
      const ids = new Set(items.map((item) => item.id));
      const fresh =
        state === null
          ? new Set<string>()
          : new Set([...ids].filter((id) => !state.ids.has(id)));
      setState({ ids, fresh });
    }
  }

  // A check remounts the row in the other section: from then on it is not
  // new, or it would fade in again on top of the shared layout move.
  function settle() {
    setState((current) => current && { ids: current.ids, fresh: EMPTY });
  }

  return { fresh: state?.fresh ?? EMPTY, settle };
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Marking choreography (DESIGN_DIRECTION.md, section 8): the row stays where
 * it was while the strike and the check play (they are transitions of the
 * row, and a row that moves is a new element), then travels to the other
 * section. With reduced motion there is nothing to watch, so it moves at
 * once.
 */
function useLingering() {
  const reduced = useReducedMotion();
  const [lingering, setLingering] = useState<ReadonlyMap<string, Place>>(
    () => new Map(),
  );
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function hold(id: string, place: Place) {
    if (reduced) return;
    clearTimeout(timers.current.get(id));
    // A second tap during the hold keeps the row where it was first.
    setLingering((current) =>
      new Map(current).set(id, current.get(id) ?? place),
    );
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setLingering((current) => {
          const next = new Map(current);
          next.delete(id);
          return next;
        });
      }, motionTokens.duration.base * 1000),
    );
  }

  return { lingering, hold };
}

/**
 * The list screen body. Reads the session and makes sure the user has a list
 * (first use creates one), then shows its items split into pending and in the
 * cart. Checking an item moves it between the sections.
 */
export function ListView() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const currentList = useCurrentList(userId);
  const list = currentList.list;
  const listId = list?.id ?? null;
  const items = useItems(userId, listId);
  const toggle = useToggleItem(userId ?? "", listId ?? "");
  const edit = useEditItem(userId ?? "", listId ?? "");
  const remove = useRemoveItem(userId ?? "", listId ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const fresh = useFreshIds(items.data);
  const { lingering, hold } = useLingering();
  // While the first list is being created the add bar waits too (the server
  // does not know the list yet): nothing below the titles until both are in.
  // "Has data", not isSuccess: a failed background refetch keeps the data but
  // turns the status to error, and the rows must stay on screen.
  // The same condition the add bar waits for, so the empty state never
  // invites to add while adding would still be ignored.
  const creatingList =
    useIsMutating({ mutationKey: queryKeys.lists(userId ?? "") }) > 0;
  const loading =
    items.data === undefined || currentList.isPending || creatingList;

  // The checkbox the user just used, to give it the focus back once its row
  // has moved: the old element is gone, and the focus would fall to <body>.
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = refocus.current;
    if (id === null || lingering.has(id)) return;
    // The hold is over: the row moved, or stayed (a rejected toggle).
    refocus.current = null;
    const checkbox = document.querySelector<HTMLElement>(
      `[data-item-id="${id}"] [role="checkbox"]`,
    );
    const active = document.activeElement;
    // Only when the focus was lost with the old row, never stolen from
    // somewhere the user moved it to (the add field, for instance).
    if (
      checkbox &&
      checkbox !== active &&
      (!active || active === document.body)
    ) {
      checkbox.focus({ preventScroll: true });
    }
  });

  const { pending: unchecked, cart: checked } = splitByChecked(
    items.data ?? [],
  );
  const placeOf = (item: Item): Place =>
    lingering.get(item.id) ?? (item.checked ? "cart" : "pending");
  const byPosition = (a: Item, b: Item) => a.position - b.position;
  const all = [...unchecked, ...checked];
  const pending = all
    .filter((item) => placeOf(item) === "pending")
    .sort(byPosition);
  const cart = all.filter((item) => placeOf(item) === "cart").sort(byPosition);
  const ready = userId !== null && listId !== null;

  // The sheet shows the live item. If it is gone (a rejected add, a delete
  // by someone else), the sheet closes and the id is dropped, so the item
  // coming back later does not reopen it.
  const editing =
    editingId === null
      ? undefined
      : items.data?.find((item) => item.id === editingId && !item.deleted_at);
  if (editingId !== null && items.data !== undefined && !editing) {
    setEditingId(null);
  }

  function handleCheckedChange(item: Item, next: boolean) {
    fresh.settle();
    hold(item.id, placeOf(item));
    refocus.current = item.id;
    toggle.mutate({ id: item.id, name: item.name, checked: next });
  }

  function renderRow(item: Item) {
    return (
      <Enter
        key={item.id}
        as="li"
        data-item-id={item.id}
        // Shared layout: the row that leaves one section and the one that
        // enters the other are the same element, so it travels by transform.
        // "position" keeps the sections' different widths from scaling it.
        layoutId={item.id}
        layout="position"
        transition={{ layout: transitions.base }}
        // Only a new row fades in; rows already there (first load, or moved
        // by a check) start in their resting state.
        {...(fresh.fresh.has(item.id) ? {} : { initial: false })}
      >
        <ListRow
          as="div"
          name={item.name}
          quantity={formatQuantity(item.quantity, item.unit)}
          note={item.note ?? undefined}
          checked={item.checked}
          toggleLabel={item.name}
          onCheckedChange={(next) => handleCheckedChange(item, next)}
          onPress={() => setEditingId(item.id)}
        />
      </Enter>
    );
  }

  if (items.isError && !items.data) {
    return (
      <Banner
        tone="error"
        icon={CircleAlert}
        title={texts.list.loadError.title}
        body={texts.list.loadError.body}
        className="mt-4"
        action={
          <Button
            variant="outline"
            size="touch"
            onClick={() => items.refetch()}
            disabled={items.isFetching}
          >
            {texts.list.loadError.retry}
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListSection
        id="pending"
        title={texts.list.pending.title}
        emptyText={texts.list.pending.empty}
        count={ready ? pending.length : 0}
        loading={loading}
      >
        {ready ? pending.map(renderRow) : null}
      </ListSection>
      {/* El carro va sobre pistacho: arriba lo que falta, abajo lo que ya
          pasó por caja. */}
      <ListSection
        id="cart"
        title={texts.list.cart.title}
        emptyText={texts.list.cart.empty}
        count={ready ? cart.length : 0}
        loading={loading}
        surface="cart"
      >
        {ready ? cart.map(renderRow) : null}
      </ListSection>
      <EditItemSheet
        item={editing}
        onSave={(item, changes) =>
          edit.mutate({ id: item.id, name: item.name, changes })
        }
        onRemove={(item) => remove.mutate({ id: item.id, name: item.name })}
        onClose={() => setEditingId(null)}
      />
    </>
  );
}
