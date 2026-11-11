/**
 * The order of the supermarket, learned from the order in which past trips
 * were checked (the "línea del súper" prototype, /design/linea).
 *
 * Each trip ranks its checks by `checkedAt`, from 0 (first) to 1 (last). A
 * category's place in a trip is the median of its ranks, so one product
 * picked on the way out (the lemons someone forgot) does not drag the whole
 * category to the end. Its score is the mean of those places over the trips
 * it appears in. Categories no trip saw go after the learned ones, and ties
 * keep the list's own order. A trip counts only with checks in two
 * categories or more: one says nothing about the order between them.
 */

export type CheckedItem = {
  categoryId: string;
  /** ISO timestamp, as `items.checked_at`. */
  checkedAt: string;
};

/** Fewer trips than this, and the list's own order stays. */
export const LEARN_MIN_TRIPS = 2;

export type LearnedRoute<C extends string> = {
  order: C[];
  /** Trips that counted: checks in two known categories or more. */
  trips: number;
  learned: boolean;
};

function median(sorted: readonly number[]) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function learnRoute<C extends string>(
  trips: readonly (readonly CheckedItem[])[],
  listOrder: readonly C[],
  minTrips = LEARN_MIN_TRIPS,
): LearnedRoute<C> {
  const known = new Set<string>(listOrder);
  const places = new Map<C, { sum: number; count: number }>();
  let counted = 0;

  for (const trip of trips) {
    const checks = trip
      .filter((item) => known.has(item.categoryId))
      .map((item) => ({ ...item, at: Date.parse(item.checkedAt) }))
      // A check without a readable time has no place in the order.
      .filter((item) => Number.isFinite(item.at))
      .sort((a, b) => a.at - b.at);
    if (new Set(checks.map((item) => item.categoryId)).size < 2) continue;
    counted += 1;

    // Ranks come in increasing order, so each list is already sorted.
    const ranks = new Map<C, number[]>();
    checks.forEach((item, index) => {
      const id = item.categoryId as C;
      const list = ranks.get(id) ?? [];
      list.push(index / (checks.length - 1));
      ranks.set(id, list);
    });
    for (const [id, list] of ranks) {
      const place = places.get(id) ?? { sum: 0, count: 0 };
      place.sum += median(list);
      place.count += 1;
      places.set(id, place);
    }
  }

  if (counted < minTrips) {
    return { order: [...listOrder], trips: counted, learned: false };
  }

  const position = new Map(listOrder.map((id, index) => [id, index]));
  const score = (id: C) => {
    const place = places.get(id);
    return place ? place.sum / place.count : Number.POSITIVE_INFINITY;
  };
  const order = [...listOrder].sort((a, b) => {
    const difference = score(a) - score(b);
    // Two unseen categories give NaN: they keep the list's order.
    return difference !== 0 && !Number.isNaN(difference)
      ? difference
      : position.get(a)! - position.get(b)!;
  });
  return { order, trips: counted, learned: true };
}
