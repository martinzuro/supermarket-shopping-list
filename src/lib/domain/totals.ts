import type { Tables } from "@/lib/supabase/database.types";

export const DEFAULT_CURRENCY = "UYU";

type PricedItem = Pick<Tables<"items">, "estimated_price" | "currency"> &
  Partial<Pick<Tables<"items">, "deleted_at">>;

export type CurrencyTotal = { currency: string; total: number };

// Sums estimated_price per currency (ADR 0006). A null currency counts as the
// default. Items without price, and soft-deleted ones, are skipped. UYU first,
// then alphabetical.
export function totalsByCurrency(
  items: readonly PricedItem[],
): CurrencyTotal[] {
  const sums = new Map<string, number>();
  for (const item of items) {
    if (item.deleted_at != null || item.estimated_price == null) continue;
    const currency = item.currency || DEFAULT_CURRENCY;
    sums.set(currency, (sums.get(currency) ?? 0) + item.estimated_price);
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

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency }).format(
    amount,
  );
}
