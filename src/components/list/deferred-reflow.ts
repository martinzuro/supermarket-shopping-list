import { useCallback, useEffect, useRef, useState } from "react";

/** The section a row is shown in. */
export type Place = "pending" | "cart";

/**
 * How long the rows wait after the last check before they reflow
 * (docs/improvements.md, A-5). In the supermarket the checks come in bursts:
 * what is already in the trolley is ticked off one row after the other, a
 * tap every 300 ms to 1 s (the eye finds the next row, the thumb goes
 * there). 1.5 s is longer than that gap, so a burst never sees a row move
 * under the finger, and short enough that the list tidies itself before the
 * eye goes back to it to look for what is next. It is also well past the
 * strike and the check (`duration.base`), which play in full in place.
 * Not a motion token: nothing is animated during it, as DOUBLE_TAP_MS.
 */
export const REFLOW_IDLE_MS = 1500;

type Row = { id: string; checked: boolean; position: number };

/** Where a row is shown: where it is held, or where its data puts it. */
export function placeOf(
  item: Pick<Row, "id" | "checked">,
  held: ReadonlyMap<string, Place>,
): Place {
  return held.get(item.id) ?? (item.checked ? "cart" : "pending");
}

/**
 * The rows of each section, in list order: a held row stays in the section
 * it was shown in, checked or not; the rest go where their data says.
 */
export function placeRows<I extends Row>(
  items: readonly I[],
  held: ReadonlyMap<string, Place>,
) {
  const pending: I[] = [];
  const cart: I[] = [];
  for (const item of items) {
    (placeOf(item, held) === "pending" ? pending : cart).push(item);
  }
  const byPosition = (a: I, b: I) => a.position - b.position;
  return { pending: pending.sort(byPosition), cart: cart.sort(byPosition) };
}

/** Where every row is shown now: what a burst holds in place. */
export function placesOf(
  items: readonly Row[],
  held: ReadonlyMap<string, Place>,
): ReadonlyMap<string, Place> {
  return new Map(items.map((item) => [item.id, placeOf(item, held)]));
}

const NONE: ReadonlyMap<string, Place> = new Map();

/**
 * How far a finger may drift and still be a tap, not a scroll: about what
 * the browsers allow before they cancel the click.
 */
export const TAP_SLOP_PX = 10;

/** The keys that scroll the page from a button. Space checks the row. */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

/** A focus that is part of the burst: the checkbox of a row. */
function inBurst(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.getAttribute("role") === "checkbox" &&
    target.closest('[data-slot="list-row"]') !== null
  );
}

/**
 * Deferred reflow (A-5): checking or unchecking a row leaves every row where
 * it is shown, the checked one struck in place, while the user goes on
 * checking. Each own check restarts the wait; once REFLOW_IDLE_MS pass
 * without one, the held rows go to their sections together, in one layout
 * move. They also go at once when the user does something else: scrolls
 * (the rows are not under the finger then) or moves the focus anywhere but
 * a row's checkbox (a sheet that opens, the add field). `flush` is for the
 * rest (a tap that opens a sheet, an add, emptying the cart).
 *
 * The scroll is the user's gesture (a finger that drags past TAP_SLOP_PX,
 * the wheel, the scroll keys), not the `scroll` event: the page also
 * scrolls on its own, as when the add bar grows while the user types in it
 * and follows the end of the page (use-bar-height.ts).
 *
 * `hold` gets where every row is shown at the tap (`placesOf`): the rows
 * already held keep their place, and the others are frozen too, so a
 * change from another member (Realtime) does not move a row under the
 * finger either. It waits with the rest, and never restarts the wait. Only
 * the motion waits: the write goes out at once, and the data (the
 * counters, the progress) moves on the tap.
 */
export function useDeferredReflow() {
  const [held, setHeld] = useState(NONE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHeld((current) => (current.size === 0 ? current : NONE));
  }, []);

  const hold = useCallback(
    (places: ReadonlyMap<string, Place>) => {
      setHeld((current) => {
        const next = new Map(places);
        current.forEach((place, id) => next.set(id, place));
        return next;
      });
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, REFLOW_IDLE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const holding = held.size > 0;
  useEffect(() => {
    if (!holding) return;
    const onFocusIn = (event: FocusEvent) => {
      if (!inBurst(event.target)) flush();
    };
    let start: { x: number; y: number } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const moved = Math.hypot(
        touch.clientX - start.x,
        touch.clientY - start.y,
      );
      if (moved > TAP_SLOP_PX) flush();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // In a field the arrows move the caret (or the suggestions).
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.matches("input, textarea"));
      if (SCROLL_KEYS.has(event.key) && !typing) flush();
    };
    const passive = { passive: true } as const;
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("touchstart", onTouchStart, passive);
    window.addEventListener("touchmove", onTouchMove, passive);
    window.addEventListener("wheel", flush, passive);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("wheel", flush);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [holding, flush]);

  return { held, hold, flush };
}
