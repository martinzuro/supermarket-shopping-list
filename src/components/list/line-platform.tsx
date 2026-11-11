"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { type Line, type Station } from "@/components/list/use-line";
import { CategoryIcon } from "@/components/icons/category-icons";
import { Stagger, StaggerItem, transitions } from "@/components/motion";
import { ListRow } from "@/components/ui/list-row";
import { SwipeToRemove } from "@/components/ui/swipe-to-remove";
import { motionTokens } from "@/lib/design/motion";
import {
  CHECKOUT,
  DEFAULT_CURRENCY,
  categoryKind,
  formatMoney,
  formatQuantity,
  lineTotal,
} from "@/lib/domain";
import type { Item } from "@/lib/queries";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const t = texts.line;

/** The board's heading: the focus lands there when its station changes. */
export const LINE_HEADING_ID = "line-current";

/** A rail node's touch target, and half of it: where its center sits. */
const NODE = 44;

/** The dot that says "you are here", along the rail. */
const travel = {
  duration: motionTokens.duration.slow,
  ease: motionTokens.ease.inOut,
};

type Stop = {
  id: string;
  name: string;
  /** The category's look; null at the checkout. */
  kind: ReturnType<typeof categoryKind> | null;
  /** What is in the cart and what there is; nothing to count at the checkout. */
  done: number;
  total: number;
};

function stopOf(station: Station): Stop {
  return {
    id: station.id,
    name: station.category?.name ?? texts.list.pending.uncategorized,
    kind: station.category ? categoryKind(station.category) : "otros",
    done: station.items.length - station.pending,
    total: station.items.length,
  };
}

const threadOf = (stop: Stop) => `var(--cat-${stop.kind ?? "otros"}-thread)`;

type Flyer = { id: number; from: [number, number]; to: [number, number] };

type LinePlatformProps = {
  line: Line;
  /** Rows another member just changed: they pulse. */
  remote: ReadonlySet<string>;
  /** Rows added since the list loaded: they fade in. */
  fresh: ReadonlySet<string>;
  onCheckedChange: (
    item: Item,
    checked: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  onPress: (item: Item) => void;
  onRemove: (item: Item) => void;
};

/**
 * The shopping mode as a platform (docs/improvements.md, F-9; ADR 0010). One
 * station at a time, its name on an ink board that flips like a departures
 * board, its rows below: what is in the cart stays in its place, struck. The
 * line is a rail on the right edge, under the thumb: a node per station in
 * the list's route order; tap a node or slide along the rail to go there. A
 * checked product flies to the rail. The button that moves on is in the add
 * bar ("Siguiente: Almacén") and waits for the tap: nothing moves on a timer.
 */
export function LinePlatform({
  line,
  remote,
  fresh,
  onCheckedChange,
  onPress,
  onRemove,
}: LinePlatformProps) {
  const reduced = useReducedMotion();
  const [flyers, setFlyers] = useState<readonly Flyer[]>([]);
  const flyerId = useRef(0);

  const { stations, position, here } = line;
  const at = position.at;
  const atCheckout = at === CHECKOUT;
  const total = stations.reduce((sum, one) => sum + one.items.length, 0);
  const done = total - stations.reduce((sum, one) => sum + one.pending, 0);
  const stops: Stop[] = [
    ...stations.map(stopOf),
    { id: CHECKOUT, name: t.checkout, kind: null, done, total },
  ];
  const index = stops.findIndex((stop) => stop.id === at);
  const current = stops[index] ?? stops[stops.length - 1];
  const progress = stops.length > 1 ? index / (stops.length - 1) : 1;

  // False until the stop changes on this screen: a first render (a reload
  // mid-trip) animates nothing and says nothing. Adjusted during render, so
  // the board flips in the same pass. A stop that changed on its own (its
  // station emptied) is announced as a move too.
  const [shown, setShown] = useState(at);
  const [moved, setMoved] = useState(false);
  if (shown !== at) {
    setShown(at);
    setMoved(true);
  }
  const announcement = !moved
    ? ""
    : atCheckout
      ? t.arrivedCheckout
      : t.arrived(current.name, index + 1, stations.length);

  // Whatever had the focus may be gone with its station (a row, or the
  // bar's button at the checkout): it goes to the board, without scrolling.
  useEffect(() => {
    if (!moved) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      document.getElementById(LINE_HEADING_ID)?.focus({ preventScroll: true });
    }
  }, [at, moved]);

  function check(
    item: Item,
    checked: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const origin = event.currentTarget;
    onCheckedChange(item, checked, event);
    if (!checked) return;
    navigator.vibrate?.(8);
    if (reduced) return;
    // Where it went: the product shrinks to a dot and flies to the rail.
    const track = document.querySelector("[data-slot=line-track]");
    if (!track) return;
    const a = origin.getBoundingClientRect();
    const b = track.getBoundingClientRect();
    flyerId.current += 1;
    const flyer: Flyer = {
      id: flyerId.current,
      from: [a.left + a.width / 2, a.top + a.height / 2],
      to: [b.left + b.width / 2, b.top + b.height * progress],
    };
    setFlyers((list) => [...list, flyer]);
  }

  return (
    <>
      {/* The rail takes the right edge: everything keeps clear of it. */}
      <div data-slot="line-platform" className="pt-1 pr-12">
        <Board
          stop={current}
          number={
            atCheckout
              ? t.number(done, total)
              : t.number(index + 1, stations.length)
          }
          spoken={
            atCheckout
              ? t.cartSpoken(done, total)
              : t.stationSpoken(index + 1, stations.length)
          }
          status={here ? t.pending(here.pending) : null}
          animate={moved}
        />

        {here ? (
          <Stagger
            key={at}
            as="ul"
            initial={moved ? "hidden" : false}
            data-slot="line-rows"
            className="mt-2"
          >
            {here.items.map((item) => {
              const amount = lineTotal(item);
              return (
                <StaggerItem
                  key={item.id}
                  data-item-id={item.id}
                  // Only a row added while the station shows fades in.
                  {...(fresh.has(item.id) ? {} : { initial: false })}
                >
                  {/* Swiping deletes only what is pending (M-9): a checked
                      row is something bought. */}
                  <SwipeToRemove
                    label={texts.list.removed.swipe}
                    disabled={item.checked}
                    onRemove={() => onRemove(item)}
                  >
                    <ListRow
                      as="div"
                      name={item.name}
                      quantity={formatQuantity(item.quantity, item.unit)}
                      total={
                        amount === null
                          ? undefined
                          : formatMoney(
                              amount,
                              item.currency || DEFAULT_CURRENCY,
                            )
                      }
                      note={item.note ?? undefined}
                      checked={item.checked}
                      highlighted={remote.has(item.id)}
                      onCheckedChange={(checked, event) =>
                        check(item, checked, event)
                      }
                      onPress={() => onPress(item)}
                    />
                  </SwipeToRemove>
                </StaggerItem>
              );
            })}
          </Stagger>
        ) : null}

        <p role="status" className="sr-only" data-slot="line-announcement">
          {announcement}
        </p>
      </div>

      <Rail
        stops={stops}
        at={at}
        progress={progress}
        passed={position.passed}
        bump={done}
        onMove={line.move}
      />

      {flyers.map((flyer) => (
        <motion.span
          key={flyer.id}
          aria-hidden
          data-slot="line-flyer"
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
  /** "03/07", or the cart ("07/19") at the checkout. */
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
  // With reduced motion the letters only fade: Motion skips the transform's
  // animation, but a rotated first frame would still paint.
  const reduced = useReducedMotion();
  let letter = 0;
  return (
    <div
      data-slot="line-board"
      data-stop={stop.id}
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
      {/* The page's h1 is the masthead ("Comprando", list-masthead.tsx). */}
      <h2
        id={LINE_HEADING_ID}
        tabIndex={-1}
        className="text-display mt-3 font-serif text-balance"
      >
        <span className="sr-only">
          {spoken}
          {t.hereSpoken}
          {stop.name}
          {status ? `. ${status}` : ""}
        </span>
        <span aria-hidden className="relative block">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={stop.id}
              className="block"
              exit={{ opacity: 0 }}
              transition={transitions.fast}
            >
              {stop.name.split(" ").map((word, w) => (
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
                            animate
                              ? { opacity: 0, rotateX: reduced ? 0 : 90 }
                              : false
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
      </h2>
      {/* The aisle's color, the only one on the board. */}
      <span
        aria-hidden
        className="mt-4 block h-1 w-12"
        style={{ backgroundColor: threadOf(stop) }}
      />
      {stop.kind ? (
        <CategoryIcon
          category={stop.kind}
          className="text-inverse-fg-2 absolute right-5 bottom-5 size-6"
        />
      ) : null}
    </div>
  );
}

type RailProps = {
  stops: readonly Stop[];
  at: string;
  /** 0 at the first node, 1 at the checkout. */
  progress: number;
  passed: readonly string[];
  /** Changes with every check: the dot answers the product that arrives. */
  bump: number;
  onMove: (to: string) => void;
};

/**
 * The line as a control on the right edge: a thick track, a node per stop
 * with a 44px target, the stretch traveled filled in the "done" pair. Tap a
 * node to go there, or slide along the rail: the name of the stop under the
 * thumb shows beside it, with a tick on each one, and lifting goes there.
 */
function Rail({ stops, at, progress, passed, bump, onMove }: RailProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  // A press that slid is a scrub and moves on lifting; one that did not is a
  // tap, and the node's own click moves (the keyboard's and the reader's way
  // too). Both on one gesture would go to the same stop.
  const slid = useRef(false);
  const last = stops.length - 1;
  // The line may get shorter under a resting finger (someone removed a
  // station's last product).
  const scrubbed = scrub === null ? null : Math.min(scrub, last);

  function stopAt(event: PointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const span = box.height - NODE;
    const ratio = span > 0 ? (event.clientY - box.top - NODE / 2) / span : 0;
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  }

  return (
    // Between the header and the folded add bar, with room for its totals
    // line (M-2). Its nodes are thumb targets and must not move: a notice in
    // the bar (the undo after every check) covers the rail's end for a
    // moment instead of squeezing it. Under the header, which may grow with
    // the connection banner.
    <div className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.75rem)] bottom-[calc(var(--add-bar-height)+env(safe-area-inset-bottom,0px)+3rem)] z-5">
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
            if (slid.current) onMove(stops[stopAt(event)].id);
            // The slide is over. Its capture sends the click, if any, to the
            // rail and not to a node; a touch that moved sends none. Left
            // set, it would swallow the next tap.
            slid.current = false;
          }}
          onPointerCancel={() => {
            slid.current = false;
            setScrub(null);
          }}
          // The rail's own capture, lost. Not a node's: a finger is captured
          // by the node it lands on, and capturing it here releases that
          // one, whose event bubbles up to this handler mid-slide.
          onLostPointerCapture={(event) => {
            if (event.target === event.currentTarget) setScrub(null);
          }}
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
            const current = stop.id === at;
            const gone = stop.id !== CHECKOUT && passed.includes(stop.id);
            // A station left with something to pick is not done: it keeps
            // its ring.
            const done = gone && stop.done === stop.total;
            return (
              <button
                key={stop.id}
                type="button"
                aria-current={current ? "step" : undefined}
                data-stop={stop.id}
                data-kind={current ? "current" : gone ? "passed" : "upcoming"}
                onClick={() => onMove(stop.id)}
                className="relative flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <span className="sr-only">
                  {t.goTo(stop.name)}
                  {stop.id === CHECKOUT
                    ? ""
                    : t.nodeSpoken(stop.done, stop.total)}
                </span>
                {stop.id === CHECKOUT ? (
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
                      "duration-base block rounded-full transition-transform ease-out",
                      current
                        ? "bg-paper size-6 border-2"
                        : done
                          ? "bg-action-bg size-3"
                          : "bg-paper size-3.5 border-2",
                      scrubbed === index && "scale-150",
                    )}
                    style={
                      done && !current
                        ? undefined
                        : { borderColor: threadOf(stop) }
                    }
                  />
                )}
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

          {scrubbed !== null ? (
            <span
              aria-hidden
              data-slot="line-scrub"
              className="surface-inverse text-label rounded-field pointer-events-none absolute right-12 -translate-y-1/2 px-3 py-2 whitespace-nowrap"
              style={{
                top: `calc(${NODE / 2}px + ${last > 0 ? scrubbed / last : 0} * (100% - ${NODE}px))`,
              }}
            >
              {stops[scrubbed].name}
            </span>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
