import type { Tables } from "@/lib/supabase/database.types";
import { lineTotal } from "./price";

export const DEFAULT_CURRENCY = "UYU";

type PricedItem = Pick<Tables<"items">, "estimated_price" | "currency"> &
  Partial<Pick<Tables<"items">, "quantity" | "unit" | "deleted_at">>;

export type CurrencyTotal = { currency: string; total: number };

// Sums each item's line total (price × quantity in the price's basis, see
// lineTotal) per currency (ADR 0006). A null currency counts as the
// default. Items without price, and soft-deleted ones, are skipped. UYU
// first, then alphabetical.
export function totalsByCurrency(
  items: readonly PricedItem[],
): CurrencyTotal[] {
  const sums = new Map<string, number>();
  for (const item of items) {
    if (item.deleted_at != null) continue;
    const line = lineTotal(item);
    if (line === null) continue;
    const currency = item.currency || DEFAULT_CURRENCY;
    sums.set(currency, (sums.get(currency) ?? 0) + line);
  }
  return [...sums]
    .map(([currency, total]) => ({
      currency,
      // Drops floating point noise such as 0.1 + 0.2.
      total: Math.round(total * 1e6) / 1e6,
    }))
    .sort((a, b) => {
      if (a.currency === b.currency) return 0;
      if (a.currency === DEFAULT_CURRENCY) return -1;
      if (b.currency === DEFAULT_CURRENCY) return 1;
      return a.currency < b.currency ? -1 : 1;
    });
}

export type Estimate = {
  /** One total per currency, UYU first; empty when nothing has a price. */
  totals: CurrencyTotal[];
  /** Live items with a price, out of `count`: the totals cover only those. */
  priced: number;
  count: number;
};

/** What a section's total says: the totals and how many items they cover. */
export function estimateOf(items: readonly PricedItem[]): Estimate {
  const live = items.filter((item) => item.deleted_at == null);
  return {
    totals: totalsByCurrency(live),
    priced: live.filter((item) => item.estimated_price != null).length,
    count: live.length,
  };
}

// Whole amounts without decimals ("$ 1.234"), any other with two
// ("$ 133,50"), as prices are written here.
export function formatMoney(amount: number, currency: string): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}
