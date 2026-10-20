import type { Tables } from "@/lib/supabase/database.types";
import { matchOf, SUGGESTION_LIMIT } from "./catalog";
import { normalizeName } from "./normalize-name";
import {
  MAX_MEASURED_QUANTITY,
  sameUnit,
  unitForQuantity,
} from "./parse-item-input";

/**
 * A product added while it is already pending (docs/improvements.md, A-2):
 * the add bar does not make a second row. It says the product is on the
 * list and offers to add the quantity to it, when the two add up.
 */
type Pending = Pick<
  Tables<"items">,
  "id" | "name_normalized" | "position" | "quantity" | "unit"
>;

type Amount = { quantity: number | null; unit: string | null };

/** One item per product, the first along the list: older duplicates stay quiet. */
function firstOfEach<I extends Pending>(pending: readonly I[]): I[] {
  const seen = new Set<string>();
  return [...pending]
    .sort((a, b) => a.position - b.position)
    .filter((item) => {
      if (seen.has(item.name_normalized)) return false;
      seen.add(item.name_normalized);
      return true;
    });
}

/**
 * The pending item of this product (same normalized name), or undefined.
 * `pending` holds only what is pending: not in the cart, not deleted.
 */
export function findPending<I extends Pending>(
  name: string,
  pending: readonly I[],
): I | undefined {
  const key = normalizeName(name);
  if (key === "") return undefined;
  return firstOfEach(pending).find((item) => item.name_normalized === key);
}

/**
 * The pending items whose name matches what is being typed, by the rule of
 * suggestionsFor (the start first, then a later word), each part in list
 * order. The add bar shows them first, as what is already on the list.
 */
export function pendingMatchesFor<I extends Pending>(
  query: string,
  pending: readonly I[],
  limit = SUGGESTION_LIMIT,
): I[] {
  const key = normalizeName(query);
  const starts: I[] = [];
  const words: I[] = [];
  for (const item of firstOfEach(pending)) {
    const match = matchOf(item.name_normalized, key);
    if (match === "start") starts.push(item);
    else if (match === "word") words.push(item);
  }
  return [...starts, ...words].slice(0, limit);
}

/**
 * What a pending item becomes when `added` is added to it: the two
 * quantities summed, a line without quantity counting as one (as its price
 * does), in the item's unit, a count word in plural from two up. Null when
 * they do not add up: different units ("2 kg" and "3"), or a total past what
 * the edit sheet accepts.
 */
export function addedQuantity(
  existing: Amount,
  added: Amount,
): { quantity: number; unit: string | null } | null {
  if (!sameUnit(existing.unit, added.unit)) return null;
  const total =
    Math.round(((existing.quantity ?? 1) + (added.quantity ?? 1)) * 1000) /
    1000;
  if (total > MAX_MEASURED_QUANTITY) return null;
  return { quantity: total, unit: unitForQuantity(existing.unit, total) };
}
