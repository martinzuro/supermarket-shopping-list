"use client";

import { useIsMutating } from "@tanstack/react-query";
import { ArrowUpDown, CircleAlert } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { ADD_ITEM_INPUT_ID } from "@/components/list/add-item-bar";
import { BringOver } from "@/components/list/bring-over";
import { EditItemSheet } from "@/components/list/edit-item-sheet";
import { EstimateLine } from "@/components/list/estimate-line";
import { MembershipNotices } from "@/components/list/membership-notice";
import { ListSection } from "@/components/list/list-section";
import { RouteSheet } from "@/components/list/route-sheet";
import { SendPending } from "@/components/list/send-pending";
import { useDoubleTap } from "@/components/list/use-double-tap";
import { CategoryIcon } from "@/components/icons/category-icons";
import { FullBagIllustration } from "@/components/illustrations";
import { Enter, transitions } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { Moment } from "@/components/ui/moment";
import { Section } from "@/components/ui/section";
import { motionTokens } from "@/lib/design/motion";
import {
  DEFAULT_CURRENCY,
  categoryKind,
  estimateOf,
  formatMoney,
  formatQuantity,
  lineTotal,
  groupByCategory,
  newId,
  splitByChecked,
  type ItemGroup,
} from "@/lib/domain";
import {
  queryKeys,
  useCategories,
  useCurrentList,
  useEditItem,
  useEmptyCart,
  useItems,
  useListRealtime,
  useRemoteAnnouncement,
  useRemoteChanges,
  useRemoveItem,
  useRestoreCart,
  useToggleItem,
  type EmptyCart,
  type Item,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

type Place = "pending" | "cart";

/** An emptying of the cart: when, and the trip it makes for the history. */
type Emptying = Pick<EmptyCart, "deletedAt" | "tripId">;

/** Id of the group of items that have no category (the list has no "Otros"). */
const NO_CATEGORY = "none";
const EMPTY_CART_BUTTON_ID = "empty-cart";

const groupKey = (group: ItemGroup) => group.category?.id ?? NO_CATEGORY;

/**
 * Ids that appeared since the previous render with data (items, or the
 * category groups). The first load is the baseline (nothing is new), so rows
 * already on the list do not all animate in. A row that only moves between
 * sections keeps its id and is not new either: it travels through the shared
 * layout instead. Derived during render (React's "adjust state on change"
 * pattern), so the rows see it in the same pass that mounts them.
 */
function useFreshIds(currentIds: readonly string[] | undefined) {
  const [state, setState] = useState<{
    ids: ReadonlySet<string>;
    fresh: ReadonlySet<string>;
  } | null>(null);

  if (currentIds) {
    const unchanged =
      state !== null &&
      state.ids.size === currentIds.length &&
      currentIds.every((id) => state.ids.has(id));
    if (!unchanged) {
      const ids = new Set(currentIds);
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
  // The other members' changes reach the cache through this channel.
  useListRealtime(userId, listId);
  // The rows they just added, edited or checked pulse while this set holds
  // their id (never the user's own changes).
  const remote = useRemoteChanges(userId, listId);
  // And what a screen reader is told about them, one sentence per burst.
  const announcement = useRemoteAnnouncement(userId, listId);
  const toggle = useToggleItem(userId ?? "", listId ?? "");
  const edit = useEditItem(userId ?? "", listId ?? "");
  const remove = useRemoveItem(userId ?? "", listId ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const routeButton = useRef<HTMLButtonElement>(null);
  const categories = useCategories(userId, listId);
  const emptyCart = useEmptyCart(userId ?? "", listId ?? "");
  const restoreCart = useRestoreCart(userId ?? "", listId ?? "");
  // The emptying whose moment is on screen: its archive time and its trip
  // (F-4). Plain state on purpose: the moment shows once per emptying, so
  // after a dismiss or a reload there is nothing to remember.
  const [emptied, setEmptied] = useState<Emptying | null>(null);
  // What that emptying took, as it was: "Deshacer" brings it back (A-4).
  const [emptiedRows, setEmptiedRows] = useState<readonly Item[]>([]);
  // Whether the cart has been seen empty during this moment. The optimistic
  // archive lands a moment after the tap (onMutate awaits), so only a cart
  // that fills up again after that ends the moment.
  const [cartCleared, setCartCleared] = useState(false);
  const fresh = useFreshIds(items.data?.map((item) => item.id));
  const { lingering, hold } = useLingering();
  // A second tap at the same spot right after a check lands on what moved
  // there (the next row, once the checked one left or its group closed), or
  // on the same row, still in its place: either way, not a second request
  // (docs/improvements.md, A-4).
  const doubleTap = useDoubleTap();
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
  // The groups need the categories: until they are in, nothing under the
  // "Pendientes" title (a failed load falls back to one "Otros" group).
  const groupsLoading =
    loading || (categories.data === undefined && !categories.isError);
  const groups = groupByCategory(pending, categories.data ?? []);
  const freshGroups = useFreshIds(
    ready && !groupsLoading ? groups.map(groupKey) : undefined,
  );

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

  // The moment's action takes the focus when the moment appears (the button
  // that was tapped to get here is gone with the cart's header).
  const momentShown = emptied !== null;
  const momentAction = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (momentShown) momentAction.current?.focus();
  }, [momentShown]);

  // Whatever lands in the cart while the moment shows (a rejected emptying
  // bringing its rows back, a check that was still in its hold, a rolled
  // back uncheck) ends the moment: nothing may hide behind it. Adjusted
  // during render, so the rows and the cart's header show in the same pass.
  // The focus, if it was lost with the moment's button, goes to "Vaciar el
  // carro" again.
  const [refocusEmpty, setRefocusEmpty] = useState(0);
  if (emptied !== null && cart.length === 0 && !cartCleared) {
    setCartCleared(true);
  }
  if (emptied !== null && cartCleared && cart.length > 0) {
    setEmptied(null);
    setCartCleared(false);
    setRefocusEmpty((count) => count + 1);
  }
  const handledRefocusEmpty = useRef(0);
  useLayoutEffect(() => {
    if (refocusEmpty === handledRefocusEmpty.current) return;
    const button = document.getElementById(EMPTY_CART_BUTTON_ID);
    if (!button) return;
    handledRefocusEmpty.current = refocusEmpty;
    const active = document.activeElement;
    if (!active || active === document.body) {
      button.focus({ preventScroll: true });
    }
  });

  function handleEmptyCart() {
    // Only what is really in the cart: a row unchecked a moment ago is still
    // held there while it leaves, and must not be archived with the rest. A
    // row checked a moment ago is still held in Pendientes, unseen in the
    // cart: it stays out, lands in the cart afterwards and ends the moment.
    const rows = cart.filter((item) => item.checked);
    const ids = rows.map((item) => item.id);
    if (ids.length === 0) return;
    const emptying = { deletedAt: new Date().toISOString(), tripId: newId() };
    setEmptied(emptying);
    setEmptiedRows(rows);
    setCartCleared(false);
    // A rejection brings the rows back, and that ends the moment (above).
    emptyCart.mutate({ ids, ...emptying });
  }

  function dismissMoment() {
    document.getElementById(ADD_ITEM_INPUT_ID)?.focus();
    setEmptied(null);
  }

  // The rows land back in the cart at once, and that ends the moment (as a
  // rejected emptying does): the focus goes to "Vaciar el carro".
  function undoEmptying() {
    if (emptied === null) return;
    const emptying = emptied;
    const rows = emptiedRows;
    restoreCart.mutate(
      { ids: rows.map((item) => item.id), rows, ...emptying },
      {
        // A rejection hides the rows again: the moment comes back, with its
        // Deshacer to try again (the bar says it did not work).
        onError: () => {
          setEmptied(emptying);
          setEmptiedRows(rows);
          setCartCleared(false);
        },
      },
    );
  }

  function handleCheckedChange(
    item: Item,
    next: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (doubleTap.isDoubleTap(event)) return;
    fresh.settle();
    freshGroups.settle();
    // Something is in the cart again: the emptying is over.
    if (next) setEmptied(null);
    hold(item.id, placeOf(item));
    refocus.current = item.id;
    toggle.mutate({ id: item.id, name: item.name, checked: next });
  }

  function renderRow(item: Item, groupEnters: boolean) {
    const line = lineTotal(item);
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
        // by a check) start in their resting state. A row whose group enters
        // with it does not fade on its own: the group already does.
        {...(fresh.fresh.has(item.id) && !groupEnters
          ? {}
          : { initial: false })}
      >
        <ListRow
          as="div"
          name={item.name}
          quantity={formatQuantity(item.quantity, item.unit)}
          total={
            line === null
              ? undefined
              : formatMoney(line, item.currency || DEFAULT_CURRENCY)
          }
          note={item.note ?? undefined}
          checked={item.checked}
          highlighted={remote.has(item.id)}
          onCheckedChange={(next, event) =>
            handleCheckedChange(item, next, event)
          }
          onPress={() => setEditingId(item.id)}
        />
      </Enter>
    );
  }

  function renderGroup(group: ItemGroup<Item>) {
    const key = groupKey(group);
    const kind = group.category ? categoryKind(group.category) : "otros";
    // A group fades in only when it is new and holds something just added;
    // one reappearing because a row came back from the cart is reached by
    // that row's shared layout instead.
    const enters =
      freshGroups.fresh.has(key) &&
      group.items.some((item) => fresh.fresh.has(item.id));
    return (
      <Enter
        key={key}
        as="div"
        // The groups below slide when one above appears or disappears. Only
        // the position, never the height: nothing here is squashed.
        layout="position"
        transition={{ layout: transitions.base }}
        {...(enters ? {} : { initial: false })}
      >
        <Section
          id={`pending-${key}`}
          level={3}
          title={group.category?.name ?? texts.list.pending.uncategorized}
          count={group.items.length}
          thread={kind}
          icon={<CategoryIcon category={kind} />}
          className="py-2"
        >
          <ul className="border-rule border-t">
            {group.items.map((item) => renderRow(item, enters))}
          </ul>
        </Section>
      </Enter>
    );
  }

  // Nothing to show and nothing coming: the lists or the first list's
  // creation failed (after their retries), or the items did. Without this the
  // titles would sit over nothing and the add bar would ignore Enter.
  const listFailed = list === null && currentList.error !== null;
  if (listFailed || (items.isError && !items.data)) {
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
            onClick={() => (listFailed ? currentList.retry() : items.refetch())}
            disabled={listFailed ? currentList.isRetrying : items.isFetching}
          >
            {texts.list.loadError.retry}
          </Button>
        }
      />
    );
  }

  const t = texts.moments.cartEmptied;
  return (
    <>
      {/* What happened to the list that was here, and what the user may
          bring over from another one: above the list, never inside it. */}
      <MembershipNotices />
      {user ? <BringOver user={user} listId={listId} /> : null}
      {/* The focus lands on the moment's action, whose name alone would not
          say what happened: the moment is read out once as it appears. */}
      <div aria-live="polite" className="sr-only">
        {emptied !== null ? `${t.lead} ${t.em}. ${t.body}` : ""}
      </div>
      {/* What other members change is colour for the eyes (the pulse) and one
          sentence per burst here. Always mounted, like the connection banner's
          region, so the text is announced when it is set; the child is keyed
          by the announcement, so a sentence said twice is read twice. Never
          the user's own changes. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-slot="remote-announcement"
      >
        <span key={announcement.seq}>{announcement.text}</span>
      </div>
      <ListSection
        id="pending"
        title={texts.list.pending.title}
        emptyText={texts.list.pending.empty}
        count={ready ? pending.length : 0}
        loading={groupsLoading}
        grouped
        footer={<EstimateLine estimate={estimateOf(pending)} />}
        action={
          ready && !groupsLoading ? (
            // Side by side, their 44px touching: the icons sit 24px apart.
            <div className="flex items-center">
              {/* What is pending, as a message (F-3). First, so the route
                  button keeps its place when there is nothing to send. */}
              <SendPending
                items={items.data ?? []}
                categories={categories.data ?? []}
              />
              {/* The order of the groups is edited here: Pendientes hides the
                  empty categories, so the route sheet lists them all. */}
              {categories.data ? (
                <Button
                  ref={routeButton}
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  aria-label={texts.route.open}
                  aria-haspopup="dialog"
                  onClick={() => setRouteOpen(true)}
                >
                  <ArrowUpDown aria-hidden strokeWidth={1.5} />
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {ready ? groups.map(renderGroup) : null}
      </ListSection>
      {/* El carro va sobre pistacho: arriba lo que falta, abajo lo que ya
          pasó por caja. Al vaciarlo, el momento ocupa su lugar hasta que se
          cierra. */}
      {emptied !== null ? (
        <div
          role="group"
          aria-label={texts.moments.cartEmptied.eyebrow}
          className="mt-6"
        >
          <Moment
            eyebrow={texts.moments.cartEmptied.eyebrow}
            lead={texts.moments.cartEmptied.lead}
            em={texts.moments.cartEmptied.em}
            body={texts.moments.cartEmptied.body}
            illustration={<FullBagIllustration />}
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  ref={momentAction}
                  type="button"
                  // Lima sobre tinta: el primario del sistema se perdería en
                  // la superficie inversa.
                  className="bg-lime text-on-lime hover:bg-lime/90 dark:hover:bg-lime/90"
                  onClick={dismissMoment}
                >
                  {texts.moments.cartEmptied.action}
                </Button>
                {/* Callado sobre tinta, como "Ahora no" de la invitación. */}
                <Button
                  type="button"
                  variant="ghost"
                  className="text-inverse-fg hover:bg-inverse-fg/10"
                  onClick={undoEmptying}
                >
                  {texts.moments.cartEmptied.undo}
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <ListSection
          id="cart"
          title={texts.list.cart.title}
          emptyText={texts.list.cart.empty}
          count={ready ? cart.length : 0}
          loading={loading}
          surface="cart"
          footer={<EstimateLine estimate={estimateOf(cart)} />}
          action={
            ready && !loading && cart.length > 0 ? (
              // Outline: el carro es pistacho y "secondary" se perdería.
              <Button
                id={EMPTY_CART_BUTTON_ID}
                type="button"
                variant="outline"
                size="touch"
                onClick={handleEmptyCart}
              >
                {texts.list.cart.emptyAction}
              </Button>
            ) : undefined
          }
        >
          {ready ? cart.map((item) => renderRow(item, false)) : null}
        </ListSection>
      )}
      {ready && categories.data ? (
        <RouteSheet
          open={routeOpen}
          onOpenChange={setRouteOpen}
          userId={userId}
          listId={listId}
          categories={categories.data}
          counts={
            new Map(
              groups.flatMap((group) =>
                group.category ? [[group.category.id, group.items.length]] : [],
              ),
            )
          }
          onCloseAutoFocus={(event) => {
            // No trigger for Radix to give the focus back to: it goes to the
            // button of the header that opened the sheet.
            event.preventDefault();
            routeButton.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      <EditItemSheet
        item={editing}
        categories={categories.data}
        onSave={(item, changes) =>
          edit.mutate({ id: item.id, name: item.name, changes })
        }
        onRemove={(item) => remove.mutate({ id: item.id, name: item.name })}
        onClose={() => setEditingId(null)}
      />
    </>
  );
}
