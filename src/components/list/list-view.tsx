"use client";

import { useIsMutating } from "@tanstack/react-query";
import { ArrowUpDown, CircleAlert } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react";
import { InstallNotice } from "@/components/install/install-notice";
import {
  noteTripFinished,
  noteTripUndone,
} from "@/components/install/use-install";
import { ADD_ITEM_INPUT_ID } from "@/components/list/add-item-bar";
import { BringOver } from "@/components/list/bring-over";
import {
  placeRows,
  placesOf,
  useDeferredReflow,
} from "@/components/list/deferred-reflow";
import { EditItemSheet } from "@/components/list/edit-item-sheet";
import { EstimateLine } from "@/components/list/estimate-line";
import { MembershipNotices } from "@/components/list/membership-notice";
import { ListSection } from "@/components/list/list-section";
import { RouteSheet } from "@/components/list/route-sheet";
import { SendPending } from "@/components/list/send-pending";
import {
  SHOPPING_FINISH_ID,
  SHOPPING_START_ID,
  useShoppingFinish,
  useShoppingMode,
} from "@/components/list/shopping-mode";
import {
  TripSummary,
  tripSummarySpoken,
  type TripSummaryData,
} from "@/components/list/trip-summary";
import { useDoubleTap } from "@/components/list/use-double-tap";
import { CategoryIcon } from "@/components/icons/category-icons";
import { FullBagIllustration } from "@/components/illustrations";
import { Enter, transitions } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { SwipeToRemove } from "@/components/ui/swipe-to-remove";
import { Moment } from "@/components/ui/moment";
import { Section } from "@/components/ui/section";
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
  itemMutationKeys,
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

/** An emptying of the cart: when, and the trip it makes for the history. */
type Emptying = Pick<EmptyCart, "deletedAt" | "tripId">;

/**
 * What the moment of an emptying tells (M-3), and whether it ended a
 * shopping trip ("Terminé", F-1): its "Deshacer" goes back to the mode.
 */
type Summary = TripSummaryData & { shopping: boolean };

/** Id of the group of items that have no category (the list has no "Otros"). */
const NO_CATEGORY = "none";
const EMPTY_CART_BUTTON_ID = "empty-cart";

const groupKey = (group: ItemGroup) => group.category?.id ?? NO_CATEGORY;

/** How many of a group's rows are still to buy (none: no number). */
function pendingCount(items: readonly Item[]) {
  const count = items.filter((item) => !item.checked).length;
  return count > 0 ? count : undefined;
}

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
  // And what its moment tells about it (M-3), counted on the tap.
  const [summary, setSummary] = useState<Summary | null>(null);
  // This device in the supermarket (F-1): "Terminé" is its way to empty the
  // cart, so "Vaciar el carro" waits until the trip is over.
  const shopping = useShoppingMode(listId);
  // Whether the cart has been seen empty during this moment. The optimistic
  // archive lands a moment after the tap (onMutate awaits), so only a cart
  // that fills up again after that ends the moment.
  const [cartCleared, setCartCleared] = useState(false);
  const fresh = useFreshIds(items.data?.map((item) => item.id));
  // The rows stay where they are shown while the user goes on checking, and
  // reflow together once the checks stop (docs/improvements.md, A-5).
  const { held, hold, flush } = useDeferredReflow();
  // A second tap at the same spot right after a check lands on the same row,
  // still in its place: a hurried thumb, not a request to uncheck it (A-4).
  const doubleTap = useDoubleTap();
  // Adding something (the field, a pill, "Lo de siempre") is something else
  // than checking: the held rows go to their sections first.
  const adding =
    useIsMutating({
      mutationKey: itemMutationKeys.add(userId ?? "", listId ?? ""),
    }) +
    useIsMutating({
      mutationKey: itemMutationKeys.addMany(userId ?? "", listId ?? ""),
    });
  // Before the paint: the new row and the reflow show in one frame.
  useLayoutEffect(() => {
    if (adding > 0) flush();
  }, [adding, flush]);
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
    if (id === null || held.has(id)) return;
    // The hold is over: the row moved, or stayed (unchecked in its place, or
    // a rejected toggle).
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
  const all = [...unchecked, ...checked];
  // What the rows show: a held row stays where it was (A-5). The counters,
  // the estimates and the progress read the data instead, so they move on
  // the tap, as the row's check does.
  const { pending, cart } = placeRows(all, held);
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
  const momentGroup = useRef<HTMLDivElement>(null);
  // After "Terminé" (F-1) the button was in the bar, maybe far from the
  // cart: the whole moment comes into view, its action above the bar.
  const momentAfterTrip = momentShown && summary?.shopping === true;
  useEffect(() => {
    if (!momentShown) return;
    momentAction.current?.focus({ preventScroll: momentAfterTrip });
    if (momentAfterTrip) momentGroup.current?.scrollIntoView({ block: "end" });
  }, [momentShown, momentAfterTrip]);

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
    // While shopping, the cart is emptied from the bar.
    const button = document.getElementById(
      shopping.on ? SHOPPING_FINISH_ID : EMPTY_CART_BUTTON_ID,
    );
    if (!button) return;
    handledRefocusEmpty.current = refocusEmpty;
    const active = document.activeElement;
    if (!active || active === document.body) {
      button.focus({ preventScroll: true });
    }
  });

  /**
   * Empties the cart, with its moment. Returns whether there was anything
   * to empty.
   */
  function handleEmptyCart(fromShopping = false) {
    // What the data has checked, also a row checked a moment ago and still
    // held in Pendientes (A-5): it was checked to be bought, and "Terminé"
    // (F-1) comes right after the last check, the usual last gesture of a
    // trip. A row unchecked a moment ago and still held in the cart is
    // pending already, and stays. The held rows go to their sections first.
    flush();
    const rows = checked;
    const ids = rows.map((item) => item.id);
    if (ids.length === 0) return false;
    // A finished trip: the invitation to install the app waits for it (F-8).
    noteTripFinished();
    const emptying = { deletedAt: new Date().toISOString(), tripId: newId() };
    setEmptied(emptying);
    setEmptiedRows(rows);
    // What stays pending is what the data says: a row unchecked a moment ago
    // is pending already, though it may still be held in the cart.
    setSummary({
      count: rows.length,
      estimate: estimateOf(rows),
      remaining: unchecked.length,
      shopping: fromShopping,
    });
    setCartCleared(false);
    // A rejection brings the rows back, and that ends the moment (above).
    // After "Terminé" the trip comes back with them: nothing was paid for
    // as far as the list knows.
    emptyCart.mutate(
      { ids, ...emptying },
      {
        onError: () => {
          // Nothing was emptied: not a trip.
          noteTripUndone();
          if (fromShopping) shopping.start();
        },
      },
    );
    return true;
  }

  // "Terminé" (F-1): the trip ends with the moment of the emptied cart, and
  // the screen goes back to the usual list. With nothing in the cart it only
  // ends the trip, and the focus, if the button had it, goes to "Empezar a
  // comprar".
  const [refocusStart, setRefocusStart] = useState(0);
  useShoppingFinish(() => {
    const emptiedNow = handleEmptyCart(true);
    shopping.stop();
    if (!emptiedNow) setRefocusStart((count) => count + 1);
  });
  const handledRefocusStart = useRef(0);
  useLayoutEffect(() => {
    if (refocusStart === handledRefocusStart.current) return;
    handledRefocusStart.current = refocusStart;
    const active = document.activeElement;
    if (!active || active === document.body) {
      document
        .getElementById(SHOPPING_START_ID)
        ?.focus({ preventScroll: true });
    }
  });

  function dismissMoment() {
    document.getElementById(ADD_ITEM_INPUT_ID)?.focus();
    setEmptied(null);
  }

  // The rows land back in the cart at once, and that ends the moment (as a
  // rejected emptying does): the focus goes to "Vaciar el carro".
  // After "Terminé", the trip comes back too: the user was still shopping.
  function undoEmptying() {
    if (emptied === null) return;
    const emptying = emptied;
    const rows = emptiedRows;
    const told = summary;
    // Put back: that was no trip (F-8).
    noteTripUndone();
    if (told?.shopping) shopping.start();
    restoreCart.mutate(
      { ids: rows.map((item) => item.id), rows, ...emptying },
      {
        // A rejection hides the rows again: the moment comes back, with its
        // Deshacer to try again (the bar says it did not work).
        onError: () => {
          setEmptied(emptying);
          setEmptiedRows(rows);
          setSummary(told);
          setCartCleared(false);
          if (told?.shopping) shopping.stop();
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
    // Every row stays where it is shown, this one struck (or not) in place,
    // until the checks stop (A-5). The write goes out now.
    hold(placesOf(all, held));
    refocus.current = item.id;
    toggle.mutate({ id: item.id, name: item.name, checked: next });
  }

  /**
   * Deleting from the list (M-9): with one tap in the edit sheet or by
   * swiping a pending row. The bar's notice offers to undo it.
   */
  function removeItem(item: Item) {
    // Rows held after a check (A-5) settle first: the list moves once.
    flush();
    remove.mutate({
      id: item.id,
      name: item.name,
      row: item,
      deletedAt: new Date().toISOString(),
    });
  }

  /**
   * Swiping deletes only what is pending. A checked row is something
   * bought, also while it is still held in Pendientes (A-5): deleting it
   * takes it out of the trip, and a sideways flick while shopping with one
   * hand is the likelier accident. The edit sheet still deletes it. A
   * swipe past 10px flushes the held rows (deferred-reflow.ts), so the list
   * settles as the gesture starts, before the threshold.
   */
  function swipe(item: Item, row: ReactElement) {
    return (
      <SwipeToRemove
        label={texts.list.removed.swipe}
        disabled={item.checked}
        onRemove={() => removeItem(item)}
      >
        {row}
      </SwipeToRemove>
    );
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
        {swipe(
          item,
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
            onPress={() => {
              flush();
              setEditingId(item.id);
            }}
          />,
        )}
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
          // What is still to buy: a row checked a moment ago is struck in
          // place, but no longer counts (A-5).
          count={pendingCount(group.items)}
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
  const momentBody =
    summary !== null && summary.remaining === 0 ? t.bodyDone : t.body;
  return (
    <>
      {/* What happened to the list that was here, and what the user may
          bring over from another one: above the list, never inside it. */}
      <MembershipNotices />
      {user ? <BringOver user={user} listId={listId} /> : null}
      {/* Last of the notices, and only when no other one is up: never over
          the moment, never while shopping (F-8). */}
      <InstallNotice blocked={shopping.on || emptied !== null} />
      {/* The focus lands on the moment's action, whose name alone would not
          say what happened: the moment is read out once as it appears. */}
      <div aria-live="polite" className="sr-only">
        {emptied !== null
          ? [
              `${t.lead} ${t.em}.`,
              momentBody,
              summary ? tripSummarySpoken(summary) : "",
            ].join(" ")
          : ""}
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
        count={ready ? unchecked.length : 0}
        rows={ready ? pending.length : 0}
        loading={groupsLoading}
        grouped
        footer={<EstimateLine estimate={estimateOf(unchecked)} />}
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
                  onClick={() => {
                    flush();
                    setRouteOpen(true);
                  }}
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
          ref={momentGroup}
          role="group"
          aria-label={texts.moments.cartEmptied.eyebrow}
          className="mt-6"
          // Scrolled into view after "Terminé": the bar stays over the page.
          style={{
            scrollMarginBottom:
              "calc(var(--add-bar-measured, var(--add-bar-height)) + 1rem)",
          }}
        >
          <Moment
            eyebrow={texts.moments.cartEmptied.eyebrow}
            lead={texts.moments.cartEmptied.lead}
            em={texts.moments.cartEmptied.em}
            body={momentBody}
            details={
              summary ? (
                <TripSummary
                  count={summary.count}
                  estimate={summary.estimate}
                  remaining={summary.remaining}
                />
              ) : undefined
            }
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
          count={ready ? checked.length : 0}
          rows={ready ? cart.length : 0}
          loading={loading}
          surface="cart"
          footer={<EstimateLine estimate={estimateOf(checked)} />}
          action={
            // While shopping, "Terminé" in the bar empties it (F-1). Only
            // over something checked: a row unchecked a moment ago may still
            // be held here (A-5).
            ready &&
            !loading &&
            cart.some((item) => item.checked) &&
            !shopping.on ? (
              // Outline: el carro es pistacho y "secondary" se perdería.
              <Button
                id={EMPTY_CART_BUTTON_ID}
                type="button"
                variant="outline"
                size="touch"
                onClick={() => handleEmptyCart()}
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
        onRemove={removeItem}
        onClose={() => setEditingId(null)}
      />
    </>
  );
}
