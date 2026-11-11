"use client";

import { ArrowRight, CornerLeftUp, Plus, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
import {
  Collapse,
  Stagger,
  StaggerItem,
  transitions,
} from "@/components/motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { motionTokens } from "@/lib/design/motion";
import { categoryIds, type CategoryId } from "@/lib/design/tokens";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";
import { learnRoute } from "@/lib/domain";
import { pastTrips } from "./sample";

const t = texts.design.line;
const names = texts.design.categories.names;

/** Learned once: the sample does not change. */
const LEARNED = learnRoute(pastTrips, categoryIds);

const CHECKOUT = "caja";
/** The one station of a list without categories. */
const SIMPLE = "lista";
type StationId = CategoryId | typeof SIMPLE;
type Stop = StationId | typeof CHECKOUT;
type Order = "learned" | "list" | "simple";

type Product = {
  name: string;
  quantity: string | null;
  category: CategoryId;
};
type Item = Product & { id: string; checked: boolean };

/** A product added to a station already passed. */
type Notice = { name: string; station: StationId; by: string | null };

type State = {
  order: Order;
  items: Item[];
  /** The stop you are at. */
  at: Stop;
  passed: StationId[];
  /** How many of the "+" samples are in. */
  added: number;
  lateAdded: boolean;
  notice: Notice | null;
  announcement: string;
  /** The station someone else just changed. */
  pulse: StationId | null;
  /** False until something happens: a first render animates nothing. */
  moved: boolean;
};

type Action =
  | { type: "check"; id: string; checked: boolean }
  | { type: "move"; to: Stop }
  | { type: "next" }
  | { type: "add"; product: Product; by: string | null }
  | { type: "settle" }
  | { type: "reset"; order: Order };

/** The dot that says "you are here", along the rail. */
const travel = {
  duration: motionTokens.duration.slow,
  ease: motionTokens.ease.inOut,
};

const HEADING_ID = "line-current";
/** A rail node's touch target, and half of it: where its center sits. */
const NODE = 44;

/**
 * The look of `disabled` for a button that only says it (`aria-disabled`),
 * so the focus does not drop to the page when it runs out.
 */
const inert =
  "aria-disabled:border-rule aria-disabled:bg-paper-hover aria-disabled:text-ink-3 aria-disabled:hover:bg-paper-hover dark:aria-disabled:hover:bg-paper-hover aria-disabled:cursor-default aria-disabled:active:scale-100";

function stationOf(order: Order, item: Item): StationId {
  return order === "simple" ? SIMPLE : item.category;
}

/** The stops of this trip: the route's categories that have something. */
function stationsOf(order: Order, items: readonly Item[]): StationId[] {
  if (order === "simple") return [SIMPLE];
  const route = order === "learned" ? LEARNED.order : categoryIds;
  return route.filter((id) => items.some((item) => item.category === id));
}

function itemsIn(order: Order, items: readonly Item[], id: StationId) {
  return items.filter((item) => stationOf(order, item) === id);
}

function pendingIn(order: Order, items: readonly Item[], id: StationId) {
  return itemsIn(order, items, id).filter((item) => !item.checked).length;
}

function indexOf(stations: readonly StationId[], stop: Stop) {
  return stop === CHECKOUT ? stations.length : stations.indexOf(stop);
}

function nameOf(stop: Stop) {
  return stop === CHECKOUT
    ? t.checkout
    : stop === SIMPLE
      ? t.simple
      : names[stop];
}

function threadOf(stop: Stop) {
  return stop === CHECKOUT || stop === SIMPLE
    ? "var(--cat-otros-thread)"
    : `var(--cat-${stop}-thread)`;
}

/** The next stop ahead with something to pick, or the checkout. */
function nextStop(state: State): Stop {
  const stations = stationsOf(state.order, state.items);
  for (let i = indexOf(stations, state.at) + 1; i < stations.length; i += 1) {
    const id = stations[i];
    if (
      !state.passed.includes(id) &&
      pendingIn(state.order, state.items, id) > 0
    ) {
      return id;
    }
  }
  return CHECKOUT;
}

/**
 * Going forward passes the station left and every one walked through on the
 * way. Going back leaves the station left ahead again: it was not finished.
 * The checkout is past every station.
 */
function moveTo(state: State, to: Stop): State {
  if (to === state.at) return state;
  const stations = stationsOf(state.order, state.items);
  const from = indexOf(stations, state.at);
  const target = indexOf(stations, to);
  const passed = new Set(to === CHECKOUT ? stations : state.passed);
  if (to !== CHECKOUT) passed.delete(to);
  for (let i = Math.max(from, 0); i < Math.min(target, stations.length); i++) {
    passed.add(stations[i]);
  }
  return {
    ...state,
    at: to,
    passed: stations.filter((id) => passed.has(id)),
    // The notice is of the moment: moving on answers it.
    notice: null,
    announcement:
      to === CHECKOUT
        ? t.arrivedCheckout
        : to === SIMPLE
          ? t.arrivedSimple
          : t.arrived(names[to], target + 1, stations.length),
    moved: true,
  };
}

/** The sample mid-trip: the bakery and the greengrocer, or two stations, done. */
function initialState(order: Order): State {
  const fresh: Item[] = t.sample.items.map((product, index) => ({
    ...product,
    id: `sample-${index}`,
    checked: false,
  }));
  const stations = stationsOf(order, fresh);
  const done: readonly string[] =
    order === "simple" ? LEARNED.order.slice(0, 2) : stations.slice(0, 2);
  return {
    order,
    items: fresh.map((item) =>
      done.includes(item.category) ? { ...item, checked: true } : item,
    ),
    at: order === "simple" ? SIMPLE : stations[2],
    passed: order === "simple" ? [] : stations.slice(0, 2),
    added: 0,
    lateAdded: false,
    notice: null,
    announcement: "",
    pulse: null,
    moved: false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "check":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, checked: action.checked } : item,
        ),
        moved: true,
      };
    case "move":
      return moveTo(state, action.to);
    case "next":
      return state.at === CHECKOUT ? state : moveTo(state, nextStop(state));
    case "add": {
      const item: Item = {
        ...action.product,
        id: `added-${state.items.length}`,
        checked: false,
      };
      const items = [...state.items, item];
      const station = stationOf(state.order, item);
      // A category new to this trip that lands above you is behind you too.
      const stations = stationsOf(state.order, items);
      const fresh = itemsIn(state.order, state.items, station).length === 0;
      const passed =
        fresh && stations.indexOf(station) < indexOf(stations, state.at)
          ? stations.filter((id) => id === station || state.passed.includes(id))
          : state.passed;
      const behind = passed.includes(station);
      const notice: Notice = { name: item.name, station, by: action.by };
      return {
        ...state,
        items,
        passed,
        added: action.by === null ? state.added + 1 : state.added,
        lateAdded: state.lateAdded || action.by !== null,
        // At the checkout the ticket shows it. Either way the status region,
        // always mounted, is what says it.
        notice: behind && state.at !== CHECKOUT ? notice : state.notice,
        announcement: behind ? lateText(notice) : state.announcement,
        pulse: action.by === null ? state.pulse : station,
        moved: true,
      };
    }
    case "settle":
      return { ...state, pulse: null };
    case "reset":
      return initialState(action.order);
  }
}

function lateText(notice: Notice) {
  const station = nameOf(notice.station);
  return notice.by
    ? t.late.byOther(notice.name, notice.by, station)
    : t.late.bySelf(notice.name, station);
}

type Flyer = { id: number; from: [number, number]; to: [number, number] };

/**
 * The prototype of "la línea del súper" (/design/linea): shopping mode as a
 * platform. One station at a time, its name on an ink board that flips like
 * a departures board, its rows below. The line is a rail on the right edge,
 * under the thumb: a node per station in the order the supermarket is walked
 * (learned from past trips, learn-route.ts); tap a node or slide along the
 * rail to go there. A checked product flies to its node. The button at the
 * bottom says what comes next and waits for you: nothing moves on a timer.
 * The line ends at the checkout, where the trip prints as a ticket. A list
 * without categories is one station and the rail measures the cart. Sample
 * data, nothing is saved.
 */
export function LinePrototype() {
  const [state, dispatch] = useReducer(reducer, "learned", initialState);
  const [flyers, setFlyers] = useState<readonly Flyer[]>([]);
  const flyerId = useRef(0);
  const reduced = useReducedMotion();

  const { order, items, at } = state;
  const stations = stationsOf(order, items);
  const stops: Stop[] = [...stations, CHECKOUT];
  const total = items.length;
  const done = items.filter((item) => item.checked).length;
  const atCheckout = at === CHECKOUT;
  const simple = order === "simple";
  const here = atCheckout ? [] : itemsIn(order, items, at);
  const pending = here.filter((item) => !item.checked).length;
  const next = nextStop(state);
  const index = indexOf(stations, at);

  // How far down the rail you are: by stations, or by the cart when the
  // list has no categories.
  const progress = atCheckout
    ? 1
    : simple
      ? total > 0
        ? done / total
        : 0
      : index / (stops.length - 1);

  // The remote pulse goes out in a second, as on a row.
  useEffect(() => {
    if (state.pulse === null) return;
    const timer = window.setTimeout(() => dispatch({ type: "settle" }), 1000);
    return () => window.clearTimeout(timer);
  }, [state.pulse]);

  // Whatever had the focus may be gone with its station: it goes to the
  // board, without scrolling.
  useEffect(() => {
    if (!state.moved) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      document.getElementById(HEADING_ID)?.focus({ preventScroll: true });
    }
  }, [at, state.moved]);

  function focusBoard() {
    document.getElementById(HEADING_ID)?.focus({ preventScroll: true });
  }

  function check(id: string, checked: boolean, origin: Element) {
    dispatch({ type: "check", id, checked });
    if (!checked) return;
    navigator.vibrate?.(8);
    if (reduced) return;
    // Where it went: the product shrinks to a dot and flies to its node.
    // To where the dot will be: without categories this check moves it.
    const track = document.querySelector("[data-slot=line-track]");
    if (!track) return;
    const a = origin.getBoundingClientRect();
    const b = track.getBoundingClientRect();
    const landing = simple && total > 0 ? (done + 1) / total : progress;
    flyerId.current += 1;
    const flyer: Flyer = {
      id: flyerId.current,
      from: [a.left + a.width / 2, a.top + a.height / 2],
      to: [b.left + b.width / 2, b.top + b.height * landing],
    };
    setFlyers((list) => [...list, flyer]);
  }

  const nextExtra =
    state.added < t.sample.extras.length ? t.sample.extras[state.added] : null;
  const orders: readonly { order: Order; label: string }[] = [
    { order: "learned", label: t.controls.useLearned },
    { order: "list", label: t.controls.useList },
    { order: "simple", label: t.controls.useSimple },
  ];

  return (
    <>
      <header className="bg-paper pt-safe border-rule sticky top-0 z-10 border-b">
        <div className="px-safe mx-auto flex h-14 w-full max-w-xl items-center justify-between gap-3">
          <p className="eyebrow">
            {texts.shopping.eyebrow} · {texts.shopping.progress(done, total)}
            <span className="sr-only">{texts.shopping.progressTail}</span>
          </p>
          <Link
            href="/design#prototipos"
            aria-label={t.exitAria}
            className={buttonVariants({ variant: "ghost" })}
          >
            {texts.shopping.exit}
          </Link>
        </div>
        <motion.div
          aria-hidden
          className="bg-action-bg pointer-events-none absolute inset-x-0 -bottom-px h-0.5 origin-left"
          initial={false}
          animate={{ scaleX: total > 0 ? done / total : 0 }}
          transition={transitions.base}
        />
      </header>

      <main className="px-safe pb-add-bar mx-auto w-full max-w-xl flex-1 pt-3">
        {/* The rail takes the right edge: everything keeps clear of it. */}
        <div className="pr-12">
          <Board
            stop={at}
            number={
              atCheckout || simple
                ? t.number(done, total)
                : t.number(index + 1, stations.length)
            }
            spoken={
              atCheckout || simple
                ? t.cartSpoken(done, total)
                : t.stationSpoken(index + 1, stations.length)
            }
            status={atCheckout ? null : t.pending(pending)}
            animate={state.moved}
          />

          <Collapse show={state.notice !== null} className="pt-3">
            {state.notice ? (
              <div
                data-slot="line-late"
                className="border-citrus-text flex items-center gap-3 border-l-2 pl-3"
              >
                <CornerLeftUp
                  aria-hidden
                  strokeWidth={1.5}
                  className="text-citrus-text size-5 shrink-0"
                />
                <p className="min-w-0 flex-1 text-pretty">
                  {lateText(state.notice)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (state.notice) {
                      dispatch({ type: "move", to: state.notice.station });
                      // The button fades out with its notice, focus and all.
                      focusBoard();
                    }
                  }}
                >
                  {t.late.back}
                </Button>
              </div>
            ) : null}
          </Collapse>

          {atCheckout ? (
            <Ticket
              order={order}
              items={items}
              stations={stations}
              animate={state.moved}
            />
          ) : (
            <Stagger
              key={at}
              as="ul"
              initial={state.moved ? "hidden" : false}
              data-slot="line-rows"
              className="mt-2"
            >
              {here.map((item) => (
                <StaggerItem key={item.id}>
                  <ListRow
                    as="div"
                    name={item.name}
                    quantity={item.quantity ?? undefined}
                    checked={item.checked}
                    onCheckedChange={(checked, event) =>
                      check(item.id, checked, event.currentTarget)
                    }
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          <p className="eyebrow mt-6">
            {simple
              ? t.simpleOrder
              : order === "learned"
                ? t.learned(LEARNED.trips)
                : t.listOrder}
          </p>

          <section
            aria-labelledby="line-controls"
            className="border-rule mt-12 border-t pt-6"
          >
            <h2 id="line-controls" className="eyebrow">
              {t.controls.eyebrow}
            </h2>
            <p className="text-ink-2 mt-2 max-w-prose text-pretty">
              {t.controls.body}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                // Not `disabled`, here and below: the focus stays on it.
                aria-disabled={state.lateAdded || undefined}
                className={inert}
                onClick={() => {
                  if (!state.lateAdded) {
                    dispatch({
                      type: "add",
                      product: t.sample.late,
                      by: t.sample.lateBy,
                    });
                  }
                }}
              >
                {t.controls.late}
              </Button>
              {orders.map((option) => (
                <Button
                  key={option.order}
                  type="button"
                  variant={option.order === order ? "secondary" : "outline"}
                  aria-pressed={option.order === order}
                  onClick={() => {
                    if (option.order !== order) {
                      dispatch({ type: "reset", order: option.order });
                    }
                  }}
                >
                  {option.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() => dispatch({ type: "reset", order })}
              >
                {t.controls.reset}
              </Button>
            </div>
            <Link
              href="/design#prototipos"
              className={cn(
                buttonVariants({ variant: "link" }),
                "min-h-touch mt-2",
              )}
            >
              {t.controls.back}
            </Link>
          </section>
        </div>

        <p role="status" className="sr-only" data-slot="line-announcement">
          {state.announcement}
        </p>
      </main>

      <Rail
        stops={stops}
        at={at}
        progress={progress}
        passed={state.passed}
        pulse={state.pulse}
        count={(id) => {
          const all = itemsIn(order, items, id);
          return [all.filter((item) => item.checked).length, all.length];
        }}
        bump={done}
        onMove={(to) => dispatch({ type: "move", to })}
      />

      <div className="bg-paper border-rule fixed inset-x-0 bottom-0 z-20 border-t">
        <div className="px-safe pb-safe mx-auto flex w-full max-w-xl items-center gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            size="icon-touch-lg"
            aria-label={texts.shopping.add}
            aria-disabled={nextExtra === null || undefined}
            className={inert}
            onClick={() => {
              if (nextExtra) {
                dispatch({ type: "add", product: nextExtra, by: null });
              }
            }}
          >
            <Plus aria-hidden strokeWidth={2} />
          </Button>
          {atCheckout ? (
            <Button
              type="button"
              variant="outline"
              size="touch-lg"
              className="flex-1"
              onClick={() => dispatch({ type: "reset", order })}
            >
              <RotateCcw aria-hidden strokeWidth={1.5} />
              {t.restart}
            </Button>
          ) : (
            // What comes next, under the thumb. It fills when the station is
            // done and waits for the tap: nothing moves on its own.
            <Button
              type="button"
              variant={pending === 0 ? "default" : "secondary"}
              size="touch-lg"
              data-slot="line-next"
              data-ready={pending === 0}
              className="min-w-0 flex-1"
              onClick={() => dispatch({ type: "next" })}
            >
              <span className="truncate">
                {next === CHECKOUT ? t.toCheckout : t.next(nameOf(next))}
              </span>
              <ArrowRight aria-hidden strokeWidth={2} />
            </Button>
          )}
        </div>
      </div>

      {flyers.map((flyer) => (
        <motion.span
          key={flyer.id}
          aria-hidden
          className="bg-action-bg pointer-events-none fixed top-0 left-0 z-30 -mt-1.5 -ml-1.5 size-3 rounded-full"
          initial={{ x: flyer.from[0], y: flyer.from[1], scale: 2 }}
          animate={{ x: flyer.to[0], y: flyer.to[1], scale: 1 }}
          transition={{ ...transitions.base, ease: motionTokens.ease.inOut }}
          onAnimationComplete={() =>
            setFlyers((list) => list.filter((other) => other.id !== flyer.id))
          }
        />
      ))}
    </>
  );
}

type BoardProps = {
  stop: Stop;
  /** "03/07", or the cart ("07/19") without stations to count. */
  number: string;
  spoken: string;
  /** What is left here; nothing at the checkout. */
  status: string | null;
  animate: boolean;
};

/**
 * The board of the platform: ink in both modes, the station in the display
 * serif. Changing station flips it letter by letter, like a departures
 * board; the reader gets one stable name.
 */
function Board({ stop, number, spoken, status, animate }: BoardProps) {
  const name = nameOf(stop);
  let letter = 0;
  return (
    <div
      data-slot="line-board"
      data-stop={stop}
      className="surface-inverse rounded-sheet relative overflow-hidden px-5 pt-4 pb-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-label text-lime font-mono" data-numeric aria-hidden>
          {number}
        </p>
        {status ? (
          <p className="eyebrow text-inverse-fg-2" aria-hidden>
            {status}
          </p>
        ) : null}
      </div>
      <h1
        id={HEADING_ID}
        tabIndex={-1}
        className="text-display mt-3 font-serif text-balance"
      >
        <span className="sr-only">
          {spoken}
          {t.hereSpoken}
          {name}
          {status ? `. ${status}` : ""}
        </span>
        <span aria-hidden className="relative block">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={stop}
              className="block"
              exit={{ opacity: 0 }}
              transition={transitions.fast}
            >
              {name.split(" ").map((word, w) => (
                <span key={w}>
                  {w > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap [perspective:600px]">
                    {[...word].map((char) => {
                      const i = letter++;
                      return (
                        <motion.span
                          key={i}
                          className="inline-block origin-bottom"
                          initial={
                            animate ? { opacity: 0, rotateX: 90 } : false
                          }
                          animate={{ opacity: 1, rotateX: 0 }}
                          transition={{
                            ...transitions.base,
                            delay: Math.min(i, 12) * motionTokens.stagger,
                          }}
                        >
                          {char}
                        </motion.span>
                      );
                    })}
                  </span>
                </span>
              ))}
            </motion.span>
          </AnimatePresence>
        </span>
      </h1>
      {/* The aisle's color, the only one on the board. */}
      <span
        aria-hidden
        className="mt-4 block h-1 w-12"
        style={{ backgroundColor: threadOf(stop) }}
      />
      {stop !== CHECKOUT && stop !== SIMPLE ? (
        <CategoryIcon
          category={stop}
          className="text-inverse-fg-2 absolute right-5 bottom-5 size-6"
        />
      ) : null}
    </div>
  );
}

type RailProps = {
  stops: readonly Stop[];
  at: Stop;
  /** 0 at the first node, 1 at the checkout. */
  progress: number;
  passed: readonly StationId[];
  pulse: StationId | null;
  /** What is in the cart and what there is, per station. */
  count: (id: StationId) => [number, number];
  /** Changes with every check: the dot answers the product that arrives. */
  bump: number;
  onMove: (to: Stop) => void;
};

/**
 * The line as a control on the right edge: a thick track, a node per stop
 * with a 44px target, the stretch traveled filled in the "done" pair. Tap a
 * node to go there, or slide along the rail: the name of the stop under the
 * thumb shows beside it, with a tick on each one, and lifting goes there.
 */
function Rail({
  stops,
  at,
  progress,
  passed,
  pulse,
  count,
  bump,
  onMove,
}: RailProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  // A press that slid is a scrub and moves on lifting; one that did not is a
  // tap, and the node's own click moves. Never both.
  const slid = useRef(false);
  const last = stops.length - 1;

  function stopAt(event: PointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const span = box.height - NODE;
    const ratio = span > 0 ? (event.clientY - box.top - NODE / 2) / span : 0;
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.75rem)] bottom-[calc(var(--add-bar-height)+env(safe-area-inset-bottom,0px)+0.75rem)] z-10">
      <div className="mx-auto flex h-full w-full max-w-xl justify-end">
        <nav
          aria-label={t.rail}
          data-slot="line-rail"
          className="pointer-events-auto relative flex h-full w-11 touch-none flex-col justify-between select-none"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            slid.current = false;
            setScrub(stopAt(event));
          }}
          onPointerMove={(event) => {
            if (scrub === null) return;
            const index = stopAt(event);
            if (index !== scrub) {
              if (!slid.current) {
                slid.current = true;
                // From here on the finger may leave the rail's width.
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              navigator.vibrate?.(8);
              setScrub(index);
            }
          }}
          onPointerUp={(event) => {
            if (scrub === null) return;
            setScrub(null);
            if (slid.current) onMove(stops[stopAt(event)]);
          }}
          onPointerCancel={() => setScrub(null)}
          onLostPointerCapture={() => setScrub(null)}
        >
          {/* The track, between the centers of the first and last nodes. */}
          <span
            aria-hidden
            data-slot="line-track"
            className="bg-rule-strong absolute top-[22px] bottom-[22px] left-1/2 -ml-[3px] w-1.5 overflow-hidden rounded-full"
          >
            <motion.span
              className="bg-action-bg absolute inset-0 origin-top"
              initial={false}
              animate={{ scaleY: progress }}
              transition={travel}
            />
          </span>

          {stops.map((stop, index) => {
            const current = stop === at;
            const behind =
              stop !== CHECKOUT && passed.includes(stop)
                ? count(stop)[1] - count(stop)[0]
                : 0;
            const gone = stop !== CHECKOUT && passed.includes(stop);
            return (
              <button
                key={stop}
                type="button"
                aria-current={current ? "step" : undefined}
                data-stop={stop}
                data-kind={current ? "current" : gone ? "passed" : "upcoming"}
                onClick={() => {
                  // The click that ends a scrub is not a tap on this node.
                  if (!slid.current) onMove(stop);
                  slid.current = false;
                }}
                className="relative flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <span className="sr-only">
                  {t.goTo(nameOf(stop))}
                  {stop === CHECKOUT ? "" : t.nodeSpoken(...count(stop))}
                  {behind > 0 ? t.behindSpoken(behind) : ""}
                </span>
                {stop === CHECKOUT ? (
                  <span
                    aria-hidden
                    className={cn(
                      "block h-1.5 w-6 rounded-full",
                      current ? "bg-action-bg" : "bg-ink-2",
                    )}
                  />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "block rounded-full transition-transform ease-out",
                      "duration-base",
                      stop === SIMPLE
                        ? // No station to stand at: the cart moves the dot.
                          "bg-action-bg size-3"
                        : current
                          ? "bg-paper size-6 border-2"
                          : gone && behind === 0
                            ? "bg-action-bg size-3"
                            : "bg-paper size-3.5 border-2",
                      behind > 0 && "border-citrus",
                      scrub === index && "scale-150",
                    )}
                    style={
                      behind > 0 || (gone && !current) || stop === SIMPLE
                        ? undefined
                        : { borderColor: threadOf(stop) }
                    }
                  />
                )}
                {behind > 0 ? (
                  // A branch off the line: what was left at this station.
                  <span
                    aria-hidden
                    data-slot="line-behind"
                    className={cn(
                      "text-label text-citrus-text rounded-field pointer-events-none absolute right-9 px-1 font-mono transition-colors ease-out",
                      pulse === stop
                        ? "bg-remote-pulse duration-instant"
                        : "bg-paper duration-slow",
                    )}
                  >
                    {t.behindTag(behind)}
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* One dot for the whole line. Its carrier is as tall as the
              track, so a percentage of it is a place along the rail. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-[22px] bottom-[22px] left-1/2"
            initial={false}
            animate={{ y: `${progress * 100}%` }}
            transition={travel}
          >
            <motion.span
              key={bump}
              data-slot="line-here"
              className="bg-action-bg absolute -top-[5px] -left-[5px] block size-2.5 rounded-full"
              initial={{ scale: 1.8 }}
              animate={{ scale: 1 }}
              transition={{
                ...transitions.base,
                delay: motionTokens.duration.fast,
              }}
            />
          </motion.span>

          {scrub !== null ? (
            <span
              aria-hidden
              data-slot="line-scrub"
              className="surface-inverse text-label rounded-field pointer-events-none absolute right-12 -translate-y-1/2 px-3 py-2 whitespace-nowrap"
              style={{
                top: `calc(${NODE / 2}px + ${last > 0 ? scrub / last : 0} * (100% - ${NODE}px))`,
              }}
            >
              {nameOf(stops[scrub])}
            </span>
          ) : null}
        </nav>
      </div>
    </div>
  );
}

type TicketProps = {
  order: Order;
  items: readonly Item[];
  stations: readonly StationId[];
  animate: boolean;
};

/**
 * The checkout: the trip as a ticket, an object you can pick up (it drags
 * and springs back). A line per station, the cart's total, and what was not
 * found on a stub below the cut.
 */
function Ticket({ order, items, stations, animate }: TicketProps) {
  const done = items.filter((item) => item.checked).length;
  const lines = stations.map((id) => {
    const all = itemsIn(order, items, id);
    return {
      id,
      total: all.length,
      done: all.filter((item) => item.checked).length,
    };
  });
  const missing = lines.filter((line) => line.done < line.total);
  const line =
    "border-rule flex items-baseline justify-between gap-3 border-b py-2";

  return (
    <motion.div
      data-slot="line-ticket"
      // Sideways only: up and down is the page's scroll.
      drag="x"
      dragSnapToOrigin
      dragElastic={0.2}
      className="bg-paper-2 rounded-sheet mt-3 cursor-grab touch-pan-y px-5 py-5 active:cursor-grabbing"
      initial={animate ? { opacity: 0, y: -motionTokens.shift * 3 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.cinematic}
    >
      <p className="eyebrow">{t.ticket.eyebrow}</p>
      <Stagger
        as="ul"
        initial={animate ? "hidden" : false}
        delayChildren={motionTokens.duration.base}
        className="mt-2"
      >
        {lines.map((entry) => (
          <StaggerItem key={entry.id} className={line}>
            <span className="min-w-0 truncate">{nameOf(entry.id)}</span>
            <span data-numeric className="text-label text-ink-2 font-mono">
              {t.ticket.count(entry.done, entry.total)}
            </span>
          </StaggerItem>
        ))}
        <StaggerItem className="flex items-baseline justify-between gap-3 pt-3">
          <span className="eyebrow">{t.ticket.total}</span>
          <span data-numeric className="text-heading font-mono">
            {t.ticket.count(done, items.length)}
          </span>
        </StaggerItem>
      </Stagger>

      <div
        data-slot="line-stub"
        className="border-rule-strong mt-4 border-t border-dashed pt-4"
      >
        <p className="eyebrow">{t.ticket.missing}</p>
        {missing.length === 0 ? (
          <p className="text-ink-2 mt-1">{t.ticket.allIn}</p>
        ) : (
          <>
            <ul className="mt-1">
              {missing.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-3 py-1"
                >
                  <span className="min-w-0 truncate">{nameOf(entry.id)}</span>
                  <span
                    data-numeric
                    className="text-label text-citrus-text font-mono"
                  >
                    {t.ticket.missingCount(entry.total - entry.done)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-label text-ink-2 mt-2 text-pretty">
              {t.ticket.hint}
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
}
