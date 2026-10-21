import type { Tables } from "@/lib/supabase/database.types";
import { groupByCategory, suggestCategory } from "./categories";
import { estimateOf, type Estimate } from "./totals";

/**
 * Past trips, the history of the emptied carts (docs/improvements.md, F-4):
 * how each one is told, and what "Agregar de nuevo" brings back from it.
 */

type Item = Tables<"items">;
type Category = Tables<"categories">;
type CatalogEntry = Pick<
  Tables<"catalog">,
  "name_normalized" | "last_category_id"
>;

const DATE = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat("es-UY", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partsOf(date: Date) {
  const parts = Object.fromEntries(
    DATE.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: parts.weekday ?? "",
    day: parts.day ?? "",
    month: parts.month ?? "",
    year: parts.year ?? "",
  };
}

/**
 * The day of a trip, in this device's time zone, as the history names it:
 * "Martes 21 de octubre", and "Martes 21 de octubre de 2025" when it is not
 * this year's.
 */
export function formatTripDate(emptiedAt: string, now: Date): string {
  const { weekday, day, month, year } = partsOf(new Date(emptiedAt));
  const date = `${weekday.charAt(0).toLocaleUpperCase("es")}${weekday.slice(1)} ${day} de ${month}`;
  return year === partsOf(now).year ? date : `${date} de ${year}`;
}

/** Its time, which tells two trips of the same day apart: "18:40". */
export function formatTripTime(emptiedAt: string): string {
  return TIME.format(new Date(emptiedAt));
}

/** Whether two instants fall on the same day, in this device's time zone. */
export function sameDay(a: string, b: string): boolean {
  const day = (instant: string) => {
    const { day, month, year } = partsOf(new Date(instant));
    return `${year}-${month}-${day}`;
  };
  return day(a) === day(b);
}

/**
 * What a trip came to: its rows, all archived when the cart was emptied, at
 * the prices they had then, by currency.
 */
export function tripEstimate(
  items: readonly Pick<
    Item,
    "estimated_price" | "currency" | "quantity" | "unit"
  >[],
): Estimate {
  return estimateOf(items.map((item) => ({ ...item, deleted_at: null })));
}

/**
 * A trip's products, to add again: one per name (the first, if two rows had
 * the same one), each with the category it would land in now (category_id:
 * the one the catalog remembers, as any add, or none), in the order of the
 * route, as Pendientes will show them.
 */
export function tripAgain<I extends Item>(
  items: readonly I[],
  catalog: readonly CatalogEntry[],
  categories: readonly Category[],
): I[] {
  const seen = new Set<string>();
  const once = [...items]
    .sort((a, b) => a.position - b.position)
    .filter((item) => {
      if (seen.has(item.name_normalized)) return false;
      seen.add(item.name_normalized);
      return true;
    })
    .map((item) => ({
      ...item,
      category_id: suggestCategory(item.name, catalog, categories),
    }));
  return groupByCategory(once, categories).flatMap((group) => group.items);
}
