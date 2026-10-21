import type { Tables } from "@/lib/supabase/database.types";
import { groupByCategory } from "./categories";
import { formatQuantity } from "./format-quantity";
import { MAX_QUANTITY, canonicalUnit, isUnit } from "./parse-item-input";

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
 * after "×", an amount with its unit after the name. The note goes last,
 * after an em dash and in italics: F-2 drops that ending before it splits
 * the line by commas, so a note never comes back as a product or in the
 * name. What the add field would not read back goes there too, before the
 * note: a unit typed in the edit sheet that it does not know ("Agua ×2 —
 * _botella 1L_": the count comes back, not the unit), or a count over what
 * it takes (999). One group (everything in "Otros", say) needs no category
 * title.
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
  // Read, but dropped when pasted back: the note, and what the add field
  // would read as something else.
  const aside: string[] = [];
  // A unit alone ("L" with no quantity) says nothing to whoever reads it.
  if (item.quantity !== null) {
    const unit = item.unit === null ? null : canonicalUnit(item.unit);
    const count = `×${formatQuantity(item.quantity, null)}`;
    if (unit !== null && isUnit(unit)) {
      line += ` ${formatQuantity(item.quantity, unit)}`;
    } else if (item.quantity <= MAX_QUANTITY) {
      line += ` ${count}`;
      if (unit !== null) aside.push(oneLine(unit));
    } else {
      aside.push(
        unit === null ? count : `${formatQuantity(item.quantity, unit)}`,
      );
    }
  }
  const note = item.note === null ? "" : oneLine(item.note);
  if (note !== "") aside.push(note);
  return aside.length === 0 ? line : `${line} — _${aside.join(", ")}_`;
}
