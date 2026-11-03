import { USUAL_WINDOW_DAYS } from "./catalog";

/**
 * Each product's rhythm, from the trips (docs/improvements.md, F-7): how
 * often it goes through the checkout and, from that, whether it is due
 * before the next trip or still at home. The database states the facts (the
 * `catalog_rhythm` and `list_rhythm` views: the purchases, the last one and
 * the median gap between them); this decides what they mean, so "Lo de
 * siempre" can tell weekly water from quarterly ketchup.
 */

/** What `catalog_rhythm` says of a product bought at least once. */
export type ProductRhythm = {
  times_bought: number;
  last_bought_at: string;
  /** Median days between its purchases; null with a single one. */
  interval_days: number | null;
};

/** A rhythm that tells something: two purchases or more, so a gap is known. */
export type KnownRhythm = ProductRhythm & { interval_days: number };

/** What `list_rhythm` says of a list's trips. */
export type ListRhythm = {
  trips_count: number;
  /** Median days between its trips; null with a single one. */
  interval_days: number | null;
};

/** Days between trips while the list has fewer than two: a weekly shop. */
export const DEFAULT_LIST_INTERVAL_DAYS = 7;
/** A product bought at most this many list gaps apart is of every trip. */
export const EVERY_TRIP_FACTOR = 1.5;
/**
 * A product stays usual while no more than this many of its own gaps have
 * passed since its last purchase (never less than USUAL_WINDOW_DAYS).
 */
export const USUAL_RHYTHM_FACTOR = 2;

const DAY_MS = 86_400_000;

/** How many days apart the list's trips are: the median gap, or the default. */
export function listIntervalDays(list: ListRhythm | null | undefined): number {
  return list?.interval_days ?? DEFAULT_LIST_INTERVAL_DAYS;
}

/**
 * Whether the product's gap is known. Without it (bought once, or never
 * through the checkout) the product is treated as the catalog does today,
 * by its adds.
 */
export function hasRhythm(
  rhythm: ProductRhythm | null | undefined,
): rhythm is KnownRhythm {
  return rhythm?.interval_days != null;
}

export type RhythmKind = "every" | "periodic";

/**
 * "Cada compra" when the product comes back about every trip (its gap is at
 * most EVERY_TRIP_FACTOR times the list's); periodic otherwise.
 */
export function rhythmKind(
  rhythm: KnownRhythm,
  listInterval: number,
): RhythmKind {
  return rhythm.interval_days <= EVERY_TRIP_FACTOR * listInterval
    ? "every"
    : "periodic";
}

/**
 * Due: by its rhythm the product runs out before the next trip, which is
 * assumed one list gap away, so it goes on this one. A product of every trip
 * is always due; one bought a gap ago or more too.
 */
export function isDue(
  rhythm: KnownRhythm,
  now: Date,
  listInterval: number,
): boolean {
  const runsOut =
    Date.parse(rhythm.last_bought_at) + rhythm.interval_days * DAY_MS;
  return runsOut <= now.getTime() + listInterval * DAY_MS;
}

/**
 * Still usual: at most USUAL_RHYTHM_FACTOR of its own gaps since the last
 * purchase, and never less than the catalog's window. A quarterly product
 * does not drop out at two months, a weekly one skipped for a fortnight
 * stays, and what the household stopped buying leaves on its own.
 */
export function isStillUsual(rhythm: KnownRhythm, now: Date): boolean {
  const days = Math.max(
    USUAL_WINDOW_DAYS,
    USUAL_RHYTHM_FACTOR * rhythm.interval_days,
  );
  return now.getTime() <= Date.parse(rhythm.last_bought_at) + days * DAY_MS;
}

export type Period = { unit: "day" | "week" | "month"; count: number };

const WEEK_DAYS = 7;
const MONTH_DAYS = 365.25 / 12;

/**
 * A number of days as it is said: in days under two weeks, in weeks under
 * six, in months from there ("Cada 10 días", "Cada 3 semanas", "Cada 3
 * meses"), each rounded to the nearest whole one and never under one.
 */
export function periodOf(days: number): Period {
  if (days < 2 * WEEK_DAYS) {
    return { unit: "day", count: Math.max(1, Math.round(days)) };
  }
  if (days < 6 * WEEK_DAYS) {
    return { unit: "week", count: Math.max(1, Math.round(days / WEEK_DAYS)) };
  }
  return { unit: "month", count: Math.max(1, Math.round(days / MONTH_DAYS)) };
}

/** Whole days from the last purchase to now, never negative. */
export function daysSince(lastBoughtAt: string, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(lastBoughtAt)) / DAY_MS),
  );
}
