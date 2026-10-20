import type { Tables } from "@/lib/supabase/database.types";
import { normalizeName } from "./normalize-name";
import { canonicalUnit } from "./parse-item-input";

type Item = Tables<"items">;
type CatalogEntry = Pick<
  Tables<"catalog">,
  "name_normalized" | "last_price" | "last_currency"
>;

/**
 * What an item's estimated price is a price of (Phase 3 decision, plan 3.2):
 * the shelf price. Grams and kilos are priced per kilo, millilitres and
 * litres per litre, anything else (a count, a pack, no unit) per unit.
 */
export type PriceBasis = "kg" | "L" | "unit";

const BASES: Record<string, { basis: PriceBasis; scale: number }> = {
  kg: { basis: "kg", scale: 1 },
  g: { basis: "kg", scale: 1 / 1000 },
  L: { basis: "L", scale: 1 },
  ml: { basis: "L", scale: 1 / 1000 },
};

function measureOf(unit: string | null) {
  const canonical = unit === null ? null : canonicalUnit(unit);
  return (
    (canonical && BASES[canonical]) || { basis: "unit" as const, scale: 1 }
  );
}

/** The basis of the price for a line with this unit. */
export function priceBasis(unit: string | null): PriceBasis {
  return measureOf(unit).basis;
}

/**
 * How much of the price's basis the line holds: 500 g is 0.5 (kilos), 3 is
 * 3 (units), and a line without quantity is one of its basis.
 */
export function priceFactor(quantity: number | null, unit: string | null) {
  if (quantity === null) return 1;
  return quantity * measureOf(unit).scale;
}

/**
 * The line's estimated cost, price × quantity in the price's basis, or null
 * when the item has no price.
 */
export function lineTotal(
  item: Pick<Item, "estimated_price"> &
    Partial<Pick<Item, "quantity" | "unit">>,
): number | null {
  if (item.estimated_price == null) return null;
  const total =
    item.estimated_price *
    priceFactor(item.quantity ?? null, item.unit ?? null);
  // Drops floating point noise such as 3 × 0.1.
  return Math.round(total * 1e6) / 1e6;
}

/** Far above any grocery price: catches a slip of the finger. */
export const MAX_PRICE = 9_999_999;

const PLAIN = /^\d+(?:,\d{1,2})?$/;
const DOT_DECIMAL = /^\d+\.\d{1,2}$/;
const GROUPED = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;

/**
 * The price field of the edit sheet, as people write prices here: a comma
 * decimal ("120,50"), dots grouping thousands ("1.200", "1.200,50"), and a
 * dot with one or two digits after it read as a decimal ("3.99"), since a
 * price never has three decimals. A leading "$" or "US$" is allowed. At most
 * two decimals, from 0 up to MAX_PRICE. Empty means no price.
 */
export function parsePriceField(text: string): number | null | "invalid" {
  const clean = text
    .trim()
    .replace(/^(?:US\$|U\$S|\$)\s*/i, "")
    .replace(/\s+/g, "");
  if (clean === "") return null;
  let normalized: string;
  if (GROUPED.test(clean)) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (PLAIN.test(clean)) {
    normalized = clean.replace(",", ".");
  } else if (DOT_DECIMAL.test(clean)) {
    normalized = clean;
  } else {
    return "invalid";
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value <= MAX_PRICE ? value : "invalid";
}

/**
 * Prefill for the field: comma decimal and no grouping, so that an untouched
 * field parses back to the same number.
 */
export function formatPriceField(price: number | null): string {
  return price === null ? "" : String(price).replace(".", ",");
}

/**
 * The price a new item starts with: the last price and currency the catalog
 * remembers for that product (ADR 0006: "los propone al volver a añadirlo"),
 * or null. The catalog trigger keeps the two as a pair; a price without its
 * currency is not trusted.
 */
export function rememberedPrice(
  name: string,
  catalog: readonly CatalogEntry[],
): { price: number; currency: string } | null {
  const key = normalizeName(name);
  const entry = catalog.find((one) => one.name_normalized === key);
  if (entry?.last_price == null || !entry.last_currency) return null;
  return { price: entry.last_price, currency: entry.last_currency };
}
