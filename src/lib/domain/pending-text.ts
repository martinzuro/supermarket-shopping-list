import type { Tables } from "@/lib/supabase/database.types";
import { groupByCategory } from "./categories";
import { formatQuantity } from "./format-quantity";
import { canonicalUnit } from "./parse-item-input";

type Item = Tables<"items">;
type Category = Tables<"categories">;

/**
 * What is still to buy, as a message (docs/improvements.md, F-3): for
 * WhatsApp, and plain enough for any other chat. Pasted back in the add field,
 * splitPastedList (F-2) reads the same products with the same amounts:
 *
 *   Lo que falta:
 *
 *   *Frutas y verduras:*
 *   - Tomates 2 kg
 *   - Bananas ×6
 *
 *   *Fiambres y lácteos:*
 *   - Leche ×3 — _descremada_
 *
 * The heading and each category end with ":", which F-2 reads as titles;
 * the categories go in WhatsApp's bold. Each product on a line of its own,
 * with WhatsApp's list mark, as it would be typed in the add field: a count
 * after "×", an amount with its unit after the name, and no comma before it
 * (a unit the parser does not know then comes back in the name, as one
 * product, instead of as a product of its own). The note goes last, after an
 * em dash and in italics: F-2 drops exactly that ending before it splits the
 * line by commas, so a note never comes back as a product or in the name.
 * One group (everything in "Otros", say) needs no category title.
 */
export function pendingText<I extends Item, C extends Category>(
  items: readonly I[],
  categories: readonly C[],
  labels: {
    /** First line, ending with ":". */
    heading: string;
    /** The group of what has no category, when the list has no "Otros". */
    uncategorized: string;
  },
): string {
  const pending = items.filter(
    (item) => !item.checked && item.deleted_at == null,
  );
  if (pending.length === 0) return "";
  const groups = groupByCategory(pending, categories);
  const blocks = groups.map((group) => {
    const lines = group.items.map((item) => `- ${productLine(item)}`);
    if (groups.length === 1) return lines.join("\n");
    const title = oneLine(group.category?.name ?? labels.uncategorized);
    return [`*${title}:*`, ...lines].join("\n");
  });
  return [labels.heading, ...blocks].join(groups.length === 1 ? "\n" : "\n\n");
}

/** What a name or a note says, on one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function productLine(item: Item): string {
  let line = oneLine(item.name);
  if (item.quantity !== null) {
    // A unit alone ("L" with no quantity) says nothing to whoever reads it.
    const unit = item.unit === null ? null : canonicalUnit(item.unit);
    line +=
      unit === null
        ? ` ×${formatQuantity(item.quantity, null)}`
        : ` ${formatQuantity(item.quantity, unit)}`;
  }
  const note = item.note === null ? "" : oneLine(item.note);
  return note === "" ? line : `${line} — _${note}_`;
}
