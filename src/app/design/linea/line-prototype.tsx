"use client";

import { Check, CornerLeftUp, Plus } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import {
  useEffect,
  useReducer,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
import { REFLOW_IDLE_MS } from "@/components/list/deferred-reflow";
import {
  Collapse,
  Enter,
  Stagger,
  StaggerItem,
  transitions,
} from "@/components/motion";
import { Banner } from "@/components/ui/banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { motionTokens } from "@/lib/design/motion";
import { categoryIds, type CategoryId } from "@/lib/design/tokens";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";
import { learnRoute } from "./learn-route";
import { pastTrips } from "./sample";

const t = texts.design.line;
const names = texts.design.categories.names;

/** Learned once: the sample does not change. */
const LEARNED = learnRoute(pastTrips, categoryIds);

const CHECKOUT = "caja";
type Stop = CategoryId | typeof CHECKOUT;
type Order = "learned" | "list";
type Kind = "passed" | "current" | "upcoming";

type Product = {
  name: string;
  quantity: string | null;
  category: CategoryId;
};
type Item = Product & { id: string; checked: boolean };

/** A product added to a station already passed. */
type Notice = {
  itemId: string;
  name: string;
  category: CategoryId;
  by: string | null;
};

type State = {
  order: Order;
  items: Item[];
  /** The stop you are at. */
  at: Stop;
  passed: CategoryId[];
  /** How many of the "+" samples are in. */
  added: number;
  lateAdded: boolean;
  notice: Notice | null;
  announcement: string;
  /** Bumped by every check, so the wait before leaving starts over. */
  checks: number;
  /** The station someone else just changed. */
  pulse: CategoryId | null;
  /** False until something happens: a first render animates nothing. */
  moved: boolean;
};

type Action =
  | { type: "check"; id: string; checked: boolean }
  | { type: "move"; to: Stop }
  | { type: "advance" }
  | { type: "add"; product: Product; by: string | null }
  | { type: "dismiss" }
  | { type: "settle" }
  | { type: "reset"; order: Order };

/** The dot that says "you are here", on its way from one stop to the next. */
const travel = {
  duration: motionTokens.duration.slow,
  ease: motionTokens.ease.inOut,
};
/** The line filling behind it: the stretch left, then the one arrived at. */
const fill = {
  duration: motionTokens.duration.base,
  ease: motionTokens.ease.inOut,
};

const CURRENT_HEADING_ID = "line-current";
/**
 * The header row of a stop, its node at half of it: a row's height, and the
 * least a tap needs for the stations behind, which say the least.
 */
const HEAD = 56;
const HEAD_PASSED = 44;

function routeOf(order: Order): readonly CategoryId[] {
  return order === "learned" ? LEARNED.order : categoryIds;
}

/** The stops of this trip: the route's categories that have something. */
function stationsOf(order: Order, items: readonly Item[]) {
  return routeOf(order).filter((id) =>
    items.some((item) => item.category === id),
  );
}

function pendingIn(items: readonly Item[], id: CategoryId) {
  return items.filter((item) => item.category === id && !item.checked).length;
}

function indexOf(stations: readonly CategoryId[], stop: Stop) {
  return stop === CHECKOUT ? stations.length : stations.indexOf(stop);
}

/** The next stop ahead with something to pick, or the checkout. */
function nextStop(
  stations: readonly CategoryId[],
  items: readonly Item[],
  passed: readonly CategoryId[],
  from: Stop,
): Stop {
  for (let i = indexOf(stations, from) + 1; i < stations.length; i += 1) {
    const id = stations[i];
    if (!passed.includes(id) && pendingIn(items, id) > 0) return id;
  }
  return CHECKOUT;
}

function nameOf(stop: Stop) {
  return stop === CHECKOUT ? t.checkout : names[stop];
}

/**
 * Going forward passes the station left and every one walked through on the
 * way. Going back leaves the station left ahead again: it was not finished.
 */
function moveTo(state: State, to: Stop): State {
  if (to === state.at) return state;
  const stations = stationsOf(state.order, state.items);
  const from = indexOf(stations, state.at);
  const target = indexOf(stations, to);
  const passed = new Set(state.passed);
  if (to !== CHECKOUT) passed.delete(to);
  for (let i = Math.max(from, 0); i < Math.min(target, stations.length); i++) {
    passed.add(stations[i]);
  }
  return {
    ...state,
    at: to,
    passed: stations.filter((id) => passed.has(id)),
    announcement:
      to === CHECKOUT
        ? t.arrivedCheckout
        : t.arrived(names[to], target + 1, stations.length),
    moved: true,
  };
}

/** The sample mid-trip: the first two stations of the route done. */
function initialState(order: Order): State {
  const fresh: Item[] = t.sample.items.map((product, index) => ({
    ...product,
    id: `sample-${index}`,
    checked: false,
  }));
  const stations = stationsOf(order, fresh);
  const done = stations.slice(0, 2);
  return {
    order,
    items: fresh.map((item) =>
      done.includes(item.category) ? { ...item, checked: true } : item,
    ),
    at: stations[2],
    passed: done,
    added: 0,
    lateAdded: false,
    notice: null,
    announcement: "",
    checks: 0,
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
        checks: state.checks + 1,
      };
    case "move":
      return moveTo(state, action.to);
    case "advance": {
      if (state.at === CHECKOUT || pendingIn(state.items, state.at) > 0) {
        return state;
      }
      const stations = stationsOf(state.order, state.items);
      return moveTo(
        state,
        nextStop(stations, state.items, state.passed, state.at),
      );
    }
    case "add": {
      const item: Item = {
        ...action.product,
        id: `added-${state.items.length}`,
        checked: false,
      };
      const behind = state.passed.includes(item.category);
      return {
        ...state,
        items: [...state.items, item],
        added: action.by === null ? state.added + 1 : state.added,
        lateAdded: state.lateAdded || action.by !== null,
        notice: behind
          ? {
              itemId: item.id,
              name: item.name,
              category: item.category,
              by: action.by,
            }
          : state.notice,
        pulse: action.by === null ? state.pulse : item.category,
        moved: true,
      };
    }
    case "dismiss":
      return { ...state, notice: null };
    case "settle":
      return { ...state, pulse: null };
    case "reset":
      return initialState(action.order);
  }
}

/**
 * The prototype of "la línea del súper" (/design/linea): shopping mode as a
 * metro line. One station per category, in the order the supermarket is
 * walked, learned from past trips (learn-route.ts). The station you are at
 * opens with its rows, the ones ahead fold to a line with what they hold,
 * the ones behind to what went to the cart. Finishing a station sends the
 * dot to the next one; a product added to a station already passed says so.
 * Sample data, nothing is saved.
 */
export function LinePrototype() {
  const [state, dispatch] = useReducer(reducer, "learned", initialState);
  const stations = stationsOf(state.order, state.items);
  const total = state.items.length;
  const done = state.items.filter((item) => item.checked).length;
  const atCheckout = state.at === CHECKOUT;
  const ready = state.at !== CHECKOUT && pendingIn(state.items, state.at) === 0;
  const next = nextStop(stations, state.items, state.passed, state.at);

  // Where the dot goes: only the stop you are at has rows, so everything
  // above it is a header of a known height. No measuring, nothing to wait.
  let here = 0;
  for (const id of stations) {
    if (id === state.at) break;
    here += state.passed.includes(id) ? HEAD_PASSED : HEAD;
  }
  here += HEAD / 2;

  const noticeItem = state.notice
    ? state.items.find((item) => item.id === state.notice?.itemId)
    : undefined;
  const notice =
    state.notice &&
    noticeItem &&
    !noticeItem.checked &&
    state.passed.includes(state.notice.category)
      ? state.notice
      : null;

  // Everything checked: the station waits, like the rows of the list (A-5),
  // so a check undone in time keeps you there.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "advance" }),
      REFLOW_IDLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ready, state.checks, state.at]);

  // The remote pulse goes out in a second, as on a row.
  useEffect(() => {
    if (state.pulse === null) return;
    const timer = window.setTimeout(() => dispatch({ type: "settle" }), 1000);
    return () => window.clearTimeout(timer);
  }, [state.pulse]);

  // The control that was used is gone with its station: the focus goes to
  // where you are now, without scrolling.
  useEffect(() => {
    if (!state.moved) return;
    const active = document.activeElement;
    // The rows left behind fade out before they go, focus and all.
    const leaving = active
      ?.closest("[data-slot=line-rows]")
      ?.getAttribute("data-stop");
    if (
      !active ||
      active === document.body ||
      (leaving !== undefined && leaving !== null && leaving !== state.at)
    ) {
      document
        .getElementById(CURRENT_HEADING_ID)
        ?.focus({ preventScroll: true });
    }
  }, [state.at, state.moved]);

  const nextExtra =
    state.added < t.sample.extras.length ? t.sample.extras[state.added] : null;
  const behind = state.items.filter(
    (item) => !item.checked && state.passed.includes(item.category),
  );
  const behindStations = stations
    .filter((id) => behind.some((item) => item.category === id))
    .map((id) => names[id]);

  const noticeBanner = (
    <Collapse show={notice !== null} className="pb-3 pl-9">
      {notice ? (
        <Banner
          tone="attention"
          icon={CornerLeftUp}
          title={t.late.title(notice.name)}
          body={
            notice.by
              ? t.late.byOther(notice.by, names[notice.category])
              : t.late.bySelf(names[notice.category])
          }
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => dispatch({ type: "move", to: notice.category })}
              >
                {t.late.back}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => dispatch({ type: "dismiss" })}
              >
                {t.late.later}
              </Button>
            </>
          }
        />
      ) : null}
    </Collapse>
  );

  return (
    <>
      <header className="bg-paper pt-safe border-rule sticky top-0 z-10 border-b">
        <div className="px-safe mx-auto flex h-14 w-full max-w-xl items-center justify-between gap-3">
          {/* The board of the platform: where you are, in the serif. */}
          <h1 className="flex min-w-0 flex-col">
            <span className="eyebrow">
              {texts.shopping.eyebrow} · {texts.shopping.progress(done, total)}
              <span className="sr-only">{texts.shopping.progressTail}.</span>
            </span>
            <span className="relative flex min-w-0">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={state.at}
                  data-slot="line-board"
                  className="text-title block truncate font-serif"
                  initial={{ opacity: 0, y: motionTokens.shift }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -motionTokens.shift }}
                  transition={transitions.base}
                >
                  <span className="sr-only">{t.hereSpoken}</span>
                  {nameOf(state.at)}
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>
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

      <main className="px-safe pb-add-bar mx-auto w-full max-w-xl flex-1 pt-2">
        <LayoutGroup id="line">
          <div className="relative">
            <ol aria-label={t.route} data-slot="line">
              {stations.map((id, index) => {
                const kind: Kind =
                  id === state.at
                    ? "current"
                    : state.passed.includes(id)
                      ? "passed"
                      : "upcoming";
                return (
                  <Station
                    key={id}
                    id={id}
                    index={index}
                    count={stations.length}
                    kind={kind}
                    items={state.items.filter((item) => item.category === id)}
                    ready={ready}
                    next={nameOf(next)}
                    pulse={state.pulse === id}
                    animate={state.moved}
                    notice={kind === "current" ? noticeBanner : null}
                    onCheck={(itemId, checked) =>
                      dispatch({ type: "check", id: itemId, checked })
                    }
                    onMove={() => dispatch({ type: "move", to: id })}
                  />
                );
              })}
              <motion.li
                key={CHECKOUT}
                layout="position"
                transition={transitions.base}
                aria-current={atCheckout ? "step" : undefined}
                data-stop={CHECKOUT}
              >
                <div className="relative flex h-14 items-center gap-3">
                  <Rail
                    head={HEAD}
                    above
                    aboveFilled={atCheckout}
                    below={false}
                    gap={2}
                  >
                    {/* The end of the line: a bar across it. */}
                    <span className="relative flex w-5 items-center justify-center">
                      <span
                        className={cn(
                          "duration-base block h-1 w-5 transition-colors ease-out",
                          atCheckout ? "bg-action-bg" : "bg-ink-2",
                        )}
                      />
                    </span>
                  </Rail>
                  {atCheckout ? (
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">{t.hereShort}</p>
                      <h2
                        id={CURRENT_HEADING_ID}
                        tabIndex={-1}
                        className="text-row font-medium"
                      >
                        {t.checkout}
                      </h2>
                    </div>
                  ) : (
                    <span className="text-ink-2">{t.checkout}</span>
                  )}
                </div>
                {atCheckout ? (
                  <Enter
                    className="pl-9"
                    initial={state.moved ? "hidden" : false}
                  >
                    <p className="text-ink-2 text-pretty">
                      {behind.length > 0
                        ? t.leftBehind(behind.length, behindStations)
                        : t.allIn}
                    </p>
                  </Enter>
                ) : null}
              </motion.li>
            </ol>
            {/* One dot for the whole line: it travels from stop to stop while
              the stations close up around it. */}
            <motion.span
              aria-hidden
              data-slot="line-here"
              className="bg-action-bg pointer-events-none absolute top-0 left-[7px] size-2.5 rounded-full"
              initial={false}
              animate={{ y: here - 5 }}
              transition={travel}
            />
          </div>
        </LayoutGroup>
        <p className="eyebrow mt-4 pl-9">
          {state.order === "learned" ? t.learned(LEARNED.trips) : t.listOrder}
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
              disabled={state.lateAdded}
              onClick={() =>
                dispatch({
                  type: "add",
                  product: t.sample.late,
                  by: t.sample.lateBy,
                })
              }
            >
              {t.controls.late}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                dispatch({
                  type: "reset",
                  order: state.order === "learned" ? "list" : "learned",
                })
              }
            >
              {state.order === "learned"
                ? t.controls.useList
                : t.controls.useLearned}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => dispatch({ type: "reset", order: state.order })}
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

        <p role="status" className="sr-only" data-slot="line-announcement">
          {state.announcement}
        </p>
      </main>

      <div className="bg-paper border-rule fixed inset-x-0 bottom-0 z-20 border-t">
        <div className="px-safe pb-safe mx-auto flex w-full max-w-xl items-center gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            size="icon-touch-lg"
            aria-label={texts.shopping.add}
            disabled={nextExtra === null}
            onClick={() => {
              if (nextExtra) {
                dispatch({ type: "add", product: nextExtra, by: null });
              }
            }}
          >
            <Plus aria-hidden strokeWidth={2} />
          </Button>
          <Button
            type="button"
            size="touch-lg"
            // Not `disabled` at the checkout: the focus stays on it.
            aria-disabled={atCheckout || undefined}
            className={cn(
              "flex-1",
              atCheckout &&
                "bg-paper-hover text-ink-3 hover:bg-paper-hover dark:hover:bg-paper-hover cursor-default active:scale-100",
            )}
            onClick={() => {
              if (!atCheckout) dispatch({ type: "move", to: CHECKOUT });
            }}
          >
            <Check aria-hidden strokeWidth={2.5} />
            {texts.shopping.finish}
          </Button>
        </div>
      </div>
    </>
  );
}

type StationProps = {
  id: CategoryId;
  index: number;
  count: number;
  kind: Kind;
  items: readonly Item[];
  /** The station you are at has everything checked. */
  ready: boolean;
  next: string;
  pulse: boolean;
  animate: boolean;
  notice: ReactNode;
  onCheck: (id: string, checked: boolean) => void;
  onMove: () => void;
};

function Station({
  id,
  index,
  count,
  kind,
  items,
  ready,
  next,
  pulse,
  animate,
  notice,
  onCheck,
  onMove,
}: StationProps) {
  const pending = items.filter((item) => !item.checked).length;
  const thread = `var(--cat-${id}-thread)`;
  const behind = kind === "passed" && pending > 0;
  const name = names[id];
  const head = kind === "passed" ? HEAD_PASSED : HEAD;

  return (
    <motion.li
      layout="position"
      transition={transitions.base}
      aria-current={kind === "current" ? "step" : undefined}
      data-stop={id}
      data-kind={kind}
    >
      {/* One header in every state: the rail keeps its place in the tree,
          so its stretches fill instead of being drawn anew. */}
      <div
        className="relative flex items-center gap-3"
        style={{ height: head }}
      >
        <Rail
          head={head}
          above={index > 0}
          aboveFilled={kind !== "upcoming"}
          belowFilled={kind === "passed"}
          thread={kind === "current" ? id : undefined}
          gap={kind === "current" ? 12 : kind === "passed" && !behind ? 5 : 6}
        >
          {kind === "current" ? (
            <span
              className="block size-6 rounded-full border-2"
              style={{ borderColor: thread }}
            />
          ) : kind === "passed" && !behind ? (
            <span className="bg-action-bg block size-2.5 rounded-full" />
          ) : (
            <span
              className={cn(
                "block size-3 rounded-full border-2",
                behind && "border-citrus",
              )}
              style={behind ? undefined : { borderColor: thread }}
            />
          )}
        </Rail>

        {kind === "current" ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">
                {ready ? t.ready(next) : t.here(index + 1, count)}
              </p>
              <h2
                id={CURRENT_HEADING_ID}
                tabIndex={-1}
                className="text-row flex min-w-0 items-center gap-2 font-medium"
              >
                <span className="text-ink-2 flex shrink-0">
                  <CategoryIcon category={id} />
                </span>
                <span className="truncate">{name}</span>
              </h2>
            </div>
            <Count value={pending} spoken={t.pendingSpoken(pending)} />
          </>
        ) : (
          <button
            type="button"
            onClick={onMove}
            data-slot="line-station"
            className={cn(
              // The whole row answers the tap, rail included (::after), but
              // only the label lights up: the line stays clean.
              "rounded-field min-h-touch -mr-2 flex min-w-0 flex-1 items-center gap-3 py-1 pr-2 pl-2 text-left transition-colors after:absolute after:inset-0",
              "-ml-2",
              pulse
                ? "bg-remote-pulse duration-instant ease-out"
                : "hover:bg-paper-hover active:bg-paper-pressed duration-slow ease-out",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="sr-only">
                {kind === "passed" ? t.goBack : t.goTo}
              </span>
              <span
                className={cn("truncate", kind === "passed" && "text-ink-2")}
              >
                {name}
              </span>
              {kind === "upcoming" ? (
                <span className="text-label text-ink-2 truncate">
                  {items
                    .filter((item) => !item.checked)
                    .map((item) => item.name)
                    .join(", ")}
                </span>
              ) : null}
              <span className="sr-only">
                {t.stationSpoken(index + 1, count)}
                {kind === "passed" ? t.passedSpoken : ""}
              </span>
            </span>
            {kind === "passed" ? (
              <span
                data-numeric
                className={cn(
                  "text-label shrink-0",
                  behind ? "text-citrus-text" : "text-ink-2",
                )}
              >
                {t.cart(items.length - pending, items.length)}
                <span className="sr-only">{t.cartSpoken}</span>
              </span>
            ) : (
              <Count value={pending} spoken={t.pendingSpoken(pending)} />
            )}
          </button>
        )}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {kind === "current" ? (
          <motion.div
            key="rows"
            data-slot="line-rows"
            data-stop={id}
            className="relative"
            exit={{ opacity: 0 }}
            transition={transitions.fast}
          >
            {/* The aisle: the line in the color of the category. */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-[11px] w-0.5"
              style={{ backgroundColor: thread }}
            />
            {notice}
            <Stagger
              as="ul"
              initial={animate ? "hidden" : false}
              className="pl-9"
            >
              {items.map((item) => (
                <StaggerItem key={item.id}>
                  <ListRow
                    as="div"
                    name={item.name}
                    quantity={item.quantity ?? undefined}
                    checked={item.checked}
                    onCheckedChange={(checked) => onCheck(item.id, checked)}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

type RailProps = {
  above?: boolean;
  below?: boolean;
  aboveFilled?: boolean;
  belowFilled?: boolean;
  /** The category whose color the stretch below takes: the current aisle. */
  thread?: CategoryId;
  /** The height of the stop's header, in px. */
  head: number;
  /** Half the node: the stretches stop at its edge. */
  gap: number;
  children: ReactNode;
};

/** The column of the line in a stop's header: the stretch in, the node, the stretch out. */
function Rail({
  above = false,
  below = true,
  aboveFilled = false,
  belowFilled = false,
  thread,
  head,
  gap,
  children,
}: RailProps) {
  return (
    <span
      aria-hidden
      className="relative flex w-6 shrink-0 items-center justify-center"
      style={{ height: head }}
    >
      {above ? (
        <Stretch
          style={{ top: 0, height: head / 2 - gap }}
          filled={aboveFilled}
          // Arriving: it fills after the stretch that was left.
          delay={motionTokens.duration.fast}
        />
      ) : null}
      {below ? (
        <Stretch
          style={{ top: head / 2 + gap, bottom: 0 }}
          filled={belowFilled}
          thread={thread}
        />
      ) : null}
      {children}
    </span>
  );
}

function Stretch({
  style,
  filled,
  thread,
  delay = 0,
}: {
  style: CSSProperties;
  filled: boolean;
  thread?: CategoryId;
  delay?: number;
}) {
  return (
    <span className="absolute left-[11px] w-0.5 overflow-hidden" style={style}>
      <span className="bg-rule-strong absolute inset-0" />
      {thread ? (
        <span
          className="absolute inset-0"
          style={{ backgroundColor: `var(--cat-${thread}-thread)` }}
        />
      ) : null}
      <motion.span
        className="bg-action-bg absolute inset-0 origin-top"
        initial={false}
        animate={{ scaleY: filled ? 1 : 0 }}
        transition={{ ...fill, delay: filled ? delay : 0 }}
      />
    </span>
  );
}

/** A count in mono that rolls when it changes; the reader hears it whole. */
function Count({ value, spoken }: { value: number; spoken: string }) {
  return (
    <span className="text-label text-ink-2 relative flex shrink-0 font-mono">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          aria-hidden
          data-numeric
          initial={{ opacity: 0, y: -motionTokens.shift }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: motionTokens.shift }}
          transition={transitions.fast}
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
