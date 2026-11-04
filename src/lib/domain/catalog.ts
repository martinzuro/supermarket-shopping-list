import type { Tables } from "@/lib/supabase/database.types";
import { compareTimestamps } from "./timestamps";
import { normalizeName } from "./normalize-name";
import {
  DEFAULT_LIST_INTERVAL_DAYS,
  USUAL_WINDOW_DAYS,
  hasRhythm,
  isDue,
  isStillUsual,
  type ProductRhythm,
} from "./rhythm";

export { USUAL_WINDOW_DAYS };

/**
 * What the catalog remembers that the add bar uses to propose products
 * (Phase 3 decisions, plan 3.3): suggestions while typing, the frequent
 * products and "lo de siempre". All of it filtered in the client from the
 * cached catalog, and never a product already pending. "Lo de siempre" also
 * reads each product's rhythm from the trips (F-7, rhythm.ts).
 */
type Entry = Pick<
  Tables<"catalog">,
  "name_normalized" | "display_name" | "times_added" | "last_added_at"
>;

export const SUGGESTION_LIMIT = 5;
export const FREQUENT_LIMIT = 12;
/** A product added this many times is frequent. */
export const FREQUENT_MIN_TIMES = 2;
/** At most this many in each group of "Lo de siempre". */
export const USUAL_LIMIT = 15;
/**
 * "Lo de siempre" by the adds, for a product the trips know no rhythm of:
 * added at least this many times, the last one within USUAL_WINDOW_DAYS.
 */
export const USUAL_MIN_TIMES = 3;

const DAY_MS = 86_400_000;

/** More often first, then the most recent, then by name: a stable order. */
function byUse(a: Entry, b: Entry): number {
  return (
    b.times_added - a.times_added ||
    compareTimestamps(b.last_added_at, a.last_added_at) ||
    (a.name_normalized < b.name_normalized
      ? -1
      : a.name_normalized > b.name_normalized
        ? 1
        : 0)
  );
}

function notPending<E extends Entry>(
  catalog: readonly E[],
  pending: ReadonlySet<string>,
) {
  return catalog.filter((entry) => !pending.has(entry.name_normalized));
}

/**
 * How a normalized name matches what is being typed (already normalized):
 * "start" when the name starts with it, "word" when a later word does
 * ("leche descremada" for "desc"), null when it does not match.
 */
export function matchOf(
  nameNormalized: string,
  key: string,
): "start" | "word" | null {
  if (key === "") return null;
  if (nameNormalized.startsWith(key)) return "start";
  return nameNormalized
    .split(" ")
    .some((word, index) => index > 0 && word.startsWith(key))
    ? "word"
    : null;
}

/**
 * Products for what is being typed (the name part of the add bar's text):
 * those whose name starts with it come first, then those with a word that
 * starts with it ("leche" for "desc" in "leche descremada"), each in order
 * of use. Matching is on the normalized name, so "cafe" finds "Café".
 * `pending` holds the normalized names of the pending items: those are
 * offered by pendingMatchesFor, as what is already on the list.
 */
export function suggestionsFor<E extends Entry>(
  query: string,
  catalog: readonly E[],
  pending: ReadonlySet<string>,
  limit = SUGGESTION_LIMIT,
): E[] {
  const key = normalizeName(query);
  const starts: E[] = [];
  const words: E[] = [];
  for (const entry of notPending(catalog, pending)) {
    const match = matchOf(entry.name_normalized, key);
    if (match === "start") starts.push(entry);
    else if (match === "word") words.push(entry);
  }
  return [...starts.sort(byUse), ...words.sort(byUse)].slice(0, limit);
}

/** The products added most often, at least FREQUENT_MIN_TIMES times. */
export function frequentsOf<E extends Entry>(
  catalog: readonly E[],
  pending: ReadonlySet<string>,
  limit = FREQUENT_LIMIT,
): E[] {
  return notPending(catalog, pending)
    .filter((entry) => entry.times_added >= FREQUENT_MIN_TIMES)
    .sort(byUse)
    .slice(0, limit);
}

/** What the trips say of the list's products (useRhythm), for usualsOf. */
export type Rhythms = {
  /** By normalized name: the products bought at least once. */
  products: Readonly<Record<string, ProductRhythm>>;
  /** Days between the list's trips (listIntervalDays). */
  listInterval: number;
};

/** No trips read: every usual product is due, as before F-7. */
export const NO_RHYTHMS: Rhythms = {
  products: {},
  listInterval: DEFAULT_LIST_INTERVAL_DAYS,
};

/** "Lo de siempre" in two groups: what is due, and what is still at home. */
export type Usuals<E> = { due: E[]; later: E[] };

/**
 * "Lo de siempre" (A-3, F-7): the usual products not pending, split into
 * what to buy on this trip and what there still is at home.
 *
 * A product the trips know a rhythm of (two purchases or more) follows it:
 * usual while it is not long since its last purchase (isStillUsual), due
 * when it runs out before the next trip (isDue), still at home otherwise.
 * The rest go by their adds, as before: usual when added at least
 * USUAL_MIN_TIMES times with the last one within USUAL_WINDOW_DAYS, and
 * always due, so nothing changes for a list without trips. At most
 * USUAL_LIMIT in each group, the most used first.
 */
export function usualsOf<E extends Entry>(
  catalog: readonly E[],
  pending: ReadonlySet<string>,
  now: Date,
  rhythms: Rhythms = NO_RHYTHMS,
  limit = USUAL_LIMIT,
): Usuals<E> {
  const since = now.getTime() - USUAL_WINDOW_DAYS * DAY_MS;
  const due: E[] = [];
  const later: E[] = [];
  for (const entry of notPending(catalog, pending).sort(byUse)) {
    const rhythm = rhythms.products[entry.name_normalized];
    if (hasRhythm(rhythm)) {
      if (!isStillUsual(rhythm, now)) continue;
      (isDue(rhythm, now, rhythms.listInterval) ? due : later).push(entry);
    } else if (
      entry.times_added >= USUAL_MIN_TIMES &&
      Date.parse(entry.last_added_at) >= since
    ) {
      due.push(entry);
    }
  }
  return { due: due.slice(0, limit), later: later.slice(0, limit) };
}

/**
 * The quantity a product comes back with from the catalog (the frequents and
 * "Lo de siempre", docs/improvements.md A-3): the last one it was on the list
 * with, and its unit, or none.
 */
export function rememberedAmount(
  entry: Pick<Tables<"catalog">, "last_quantity" | "last_quantity_unit">,
): { quantity: number | null; unit: string | null } {
  return entry.last_quantity == null
    ? { quantity: null, unit: null }
    : { quantity: entry.last_quantity, unit: entry.last_quantity_unit };
}
