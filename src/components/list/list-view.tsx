"use client";

import { useState } from "react";
import { ListSection } from "@/components/list/list-section";
import { Enter, transitions } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { ListRow } from "@/components/ui/list-row";
import { splitByChecked, formatQuantity } from "@/lib/domain";
import {
  useCurrentList,
  useItems,
  useToggleItem,
  type Item,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

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
 * The list screen body. Reads the session and makes sure the user has a list
 * (first use creates one), then shows its items split into pending and in the
 * cart. Checking an item moves it between the sections.
 */
export function ListView() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const { list } = useCurrentList(userId);
  const listId = list?.id ?? null;
  const items = useItems(userId, listId);
  const toggle = useToggleItem(userId ?? "", listId ?? "");
  const fresh = useFreshIds(items.data);
  const loading = !items.isSuccess;

  const { pending, cart } = splitByChecked(items.data ?? []);
  const ready = userId !== null && listId !== null;

  function renderRow(item: Item) {
    return (
      <Enter
        key={item.id}
        as="li"
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
          onCheckedChange={(checked) => {
            fresh.settle();
            toggle.mutate({ id: item.id, name: item.name, checked });
          }}
        />
      </Enter>
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
    </>
  );
}
