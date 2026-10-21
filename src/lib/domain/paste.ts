import { normalizeName } from "./normalize-name";
import { parseItemInput } from "./parse-item-input";

/**
 * A pasted list (docs/improvements.md, F-2): the text that reaches the add
 * field from a chat or a note, split into the products it names.
 */

/** At most this many products are added from one paste (one request). */
export const PASTE_LIMIT = 50;

/** Same limit as the `items.name` column (characters, not UTF-16 units). */
const MAX_LENGTH = 200;

// Messages copied from WhatsApp keep their date and author:
// "[21/10/26, 10:30:12] Mamá: Leche" (iPhone) and
// "21/10/26, 10:30 - Mamá: Leche" (Android).
const DATE = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?`;
const WHATSAPP = new RegExp(
  `^(?:\\[${DATE}\\]|${DATE}\\s+[-–])\\s*[^:\\n]{1,40}:\\s+`,
  "iu",
);
// "1️⃣ ": a number on a keycap emoji.
const KEYCAP = /^\d️?⃣\s*/u;
// "- ", "• ", "* ": a bullet and its space.
const BULLET = /^[-–—•*·▪◦‣+>]\s+/;
// "1. ", "2) ", "3 - ": numbering, only with its mark and a space after it,
// so "2 kg tomates" and "1.5 L" keep their numbers.
const NUMBERING = /^\d{1,3}\s*[.)\-–]\s+/;
// "[ ]", "[x]": a checklist.
const CHECKBOX = /^\[[\sxX✓✔]?\]\s*/;
// Emoji and any other mark left before the first letter or number
// ("☐ ", "✅ ", "🛒 ").
const LEADING_MARKS = /^[^\p{L}\p{N}½¼¾]+/u;
// WhatsApp's bold, italic and strikethrough ("*Leche*").
const TRAILING_MARKS = /[*_~]+$/;
// The note of a product as a sent list writes it (F-3, pendingText): in
// italics after an em dash, at the end of the line ("Leche ×3 —
// _descremada_") or, written by hand, before the next product. Dropped before
// the line is split, so its commas split nothing.
const SENT_NOTE = /\s+—\s+_.+?_(?=\s*(?:;|,\s|$))/gu;
// A comma or semicolon followed by a space separates products; a comma
// between digits ("1,5 kg") does not. A semicolon always does.
const SEPARATOR = /\s*;\s*|,\s+/;
// What only says how much ("2 kg", "500 g", "x3"): it belongs to the
// product before it ("Tomates, 2 kg").
const AMOUNT_ONLY =
  /^(?:[x×]\s?\d+|(?:\d+(?:[.,]\d+)?|\d+\/\d+|[½¼¾])(?:\s*\p{L}+\.?)?)$/iu;

function cleanLine(line: string): string {
  let text = line.trim();
  // Marks can come one inside another ("- [x] pan", "1. - pan").
  for (let before = ""; before !== text;) {
    before = text;
    text = text
      .replace(KEYCAP, "")
      .replace(BULLET, "")
      .replace(NUMBERING, "")
      .replace(CHECKBOX, "")
      .trim();
  }
  text = text.replace(LEADING_MARKS, "").replace(TRAILING_MARKS, "").trim();
  // A closing parenthesis whose opening one went with the leading marks.
  if (text.endsWith(")") && !text.includes("(")) text = text.slice(0, -1);
  return text.trim();
}

/** The lines of a paste, each without what comes before or after its text. */
function lines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((raw) =>
      cleanLine(raw.trim().replace(WHATSAPP, "").replace(SENT_NOTE, "")),
    );
}

const isTitle = (line: string) => line.endsWith(":");

/**
 * Whether the part is an amount and nothing else: the parser reads it as one
 * in front of a product ("2 kg algo", "500g algo", "x3 algo"), and a word in
 * it is a unit. "2 manzanas" is a product, and a name glued to its number
 * ("7up") is never read as an amount.
 */
function isAmountOnly(part: string): boolean {
  if (!AMOUNT_ONLY.test(part)) return false;
  const parsed = parseItemInput(`${part} algo`);
  if (parsed.quantity === null) return false;
  const hasWord = /\p{L}/u.test(part.replace(/^[x×]/i, ""));
  return !hasWord || parsed.unit !== null;
}

/** Cut to the column's length by characters, never inside an emoji. */
function cut(text: string): string {
  const characters = Array.from(text);
  return characters.length <= MAX_LENGTH
    ? text
    : characters.slice(0, MAX_LENGTH).join("").trim();
}

/**
 * The products a pasted text names, as each would be typed in the add field
 * ("2 kg tomates"): one per line, and several on a line separated by commas
 * or semicolons. WhatsApp's date and author, bullets, numbering, checklist
 * marks and emoji in front go, and so do WhatsApp's bold and italic marks and
 * the note of a sent list (" — _nota_", F-3); a
 * line that is a title ("Súper:") or has no letters goes too; a part that
 * only says how much joins the product before it, if that one has no amount
 * of its own, and is dropped on its own. Each product once (the first time it
 * comes, by normalized name), each cut to the column's length.
 */
export function splitPastedList(text: string): string[] {
  const products: string[] = [];
  const seen = new Set<string>();
  for (const line of lines(text)) {
    if (line === "" || isTitle(line)) continue;
    const parts: string[] = [];
    for (const piece of line.split(SEPARATOR)) {
      const part = cleanLine(piece);
      if (part === "") continue;
      if (isAmountOnly(part)) {
        const previous = parts.at(-1);
        if (
          previous !== undefined &&
          parseItemInput(previous).quantity === null
        ) {
          parts[parts.length - 1] = `${previous}, ${part}`;
        }
        // On its own, or after a product that already says how much.
        continue;
      }
      parts.push(part);
    }
    for (const part of parts) {
      if (!/\p{L}/u.test(part)) continue;
      const product = cut(part);
      const key = normalizeName(parseItemInput(product).name);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      products.push(product);
    }
  }
  return products;
}

/**
 * The products of a paste that is a list, or null when it is not and goes
 * into the field as typed: two or more on several lines, or three or more on
 * one line (two parts of one line are often one product, "Aceite de oliva,
 * extra virgen"). On several lines, one under a title is a list too
 * ("Súper:\nLeche", or a sent list with one product, F-3): pasted as typed,
 * the title would end up in its name. `oneLine` says which.
 */
export function pastedList(
  text: string,
): { products: string[]; oneLine: boolean } | null {
  const products = splitPastedList(text);
  const oneLine = !/[\r\n]/.test(text.trim());
  const titled = !oneLine && lines(text).some(isTitle);
  const least = oneLine ? 3 : titled ? 1 : 2;
  return products.length >= least ? { products, oneLine } : null;
}
