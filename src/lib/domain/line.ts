/**
 * The supermarket line (docs/improvements.md, F-9; ADR 0010): the shopping
 * mode as a platform. A station is a category with something on this trip,
 * in route order; the last stop is the checkout. Where you are and what you
 * passed belong to this device, and these functions move them.
 *
 * Station ids are category ids, or SIMPLE_STATION for the list without
 * categories (one station with everything).
 */

/** The last stop, past every station. Never a category id (those are UUIDs). */
export const CHECKOUT = "caja";

/** The only station of the simple list. */
export const SIMPLE_STATION = "lista";

export type LineItem = {
  /** The station it belongs to: its category, or SIMPLE_STATION. */
  station: string;
  checked: boolean;
};

export type LinePosition = {
  /** The stop you are at: a station, or CHECKOUT. */
  at: string;
  /** The stations left behind, in route order. */
  passed: readonly string[];
};

/** The stops of this trip: the route's stations that have something. */
export function stationsOf(
  route: readonly string[],
  items: readonly LineItem[],
): string[] {
  const used = new Set(items.map((item) => item.station));
  return route.filter((id) => used.has(id));
}

/** How many items of a station are still to pick. */
export function pendingIn(items: readonly LineItem[], station: string): number {
  return items.filter((item) => item.station === station && !item.checked)
    .length;
}

function indexOf(stations: readonly string[], stop: string) {
  return stop === CHECKOUT ? stations.length : stations.indexOf(stop);
}

/**
 * Where a trip starts: the first station with something to pick, with the
 * ones before it (already in the cart) passed. With nothing to pick, the
 * checkout.
 */
export function startOf(
  stations: readonly string[],
  items: readonly LineItem[],
): LinePosition {
  const first = stations.findIndex((id) => pendingIn(items, id) > 0);
  return first === -1
    ? { at: CHECKOUT, passed: [...stations] }
    : { at: stations[first], passed: stations.slice(0, first) };
}

/** The next stop ahead with something to pick, or the checkout. */
export function nextStop(
  stations: readonly string[],
  items: readonly LineItem[],
  position: LinePosition,
): string {
  for (let i = indexOf(stations, position.at) + 1; i < stations.length; i++) {
    const id = stations[i];
    if (!position.passed.includes(id) && pendingIn(items, id) > 0) return id;
  }
  return CHECKOUT;
}

/**
 * Going forward passes the station left and every one walked through on the
 * way. Going back leaves the station left ahead again: it was not finished.
 * The checkout is past every station. A stop that is not on the line moves
 * nothing.
 */
export function moveTo(
  stations: readonly string[],
  position: LinePosition,
  to: string,
): LinePosition {
  const target = indexOf(stations, to);
  if (to === position.at || target === -1) return position;
  const from = indexOf(stations, position.at);
  const passed = new Set(to === CHECKOUT ? stations : position.passed);
  passed.delete(to);
  for (let i = Math.max(from, 0); i < Math.min(target, stations.length); i++) {
    passed.add(stations[i]);
  }
  return { at: to, passed: stations.filter((id) => passed.has(id)) };
}

/**
 * The passed stations with something still to pick, and how much: what was
 * left behind. After coming back along the line, a station left earlier may
 * be ahead of you again and still count: it was passed, and "Siguiente"
 * will not stop there.
 */
export function behindOf(
  stations: readonly string[],
  items: readonly LineItem[],
  position: LinePosition,
): Map<string, number> {
  const behind = new Map<string, number>();
  for (const id of stations) {
    if (id === position.at || !position.passed.includes(id)) continue;
    const pending = pendingIn(items, id);
    if (pending > 0) behind.set(id, pending);
  }
  return behind;
}

/**
 * The position after the line itself changed (someone added to a category
 * that had nothing, the last item of a station was removed, the route was
 * reordered). A station that lands above you, new to the trip or moved by
 * the route, is behind you too. If your station is gone, you stand at the next one that was ahead of
 * it, or at the checkout.
 */
export function reconcileLine(
  previous: readonly string[],
  stations: readonly string[],
  position: LinePosition,
): LinePosition {
  let at = position.at;
  if (at !== CHECKOUT && !stations.includes(at)) {
    const was = previous.indexOf(at);
    const ahead = was === -1 ? [] : previous.slice(was + 1);
    at = ahead.find((id) => stations.includes(id)) ?? CHECKOUT;
  }
  const here = indexOf(stations, at);
  // Everything above you is behind you: a station new to the trip, or one
  // the route moved there. Left out, nothing would ever lead to it again
  // (nextStop only looks ahead). The checkout is past every station.
  const passed = stations.filter(
    (id, index) => id !== at && (index < here || position.passed.includes(id)),
  );
  if (at === position.at && sameIds(passed, position.passed)) return position;
  return { at, passed };
}

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
