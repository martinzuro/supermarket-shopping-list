export type ParsedItemInput = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

// The add bar is a single text field. This extracts an optional quantity and
// unit typed together with the product name (Spanish, Uruguay).
//
// Forms recognised, tried in this order (first valid match wins):
//   1. Leading multiplier:  "x3 leche", "3x leche"
//   2. Leading quantity:    "2 kg tomates", "2kg tomates", "3 leches",
//                           "2 paquetes de fideos" (a "de" after the unit is
//                           dropped)
//   3. Trailing multiplier: "leche x3", "leche x 3", "leche 3x"
//   4. Trailing quantity:   "tomates 2 kg", "leche 3", "jamón 200g"
//
// A quantity is an integer, a decimal ("1,5", "1.5"), a fraction ("1/2") or
// a vulgar fraction glyph, and must be in (0, 999]. A unit is a known word
// (see UNITS and COUNT_WORDS); any other word stays in the name. Nothing is
// parsed when it would leave the name empty ("2 kg", "3", "x3") or when the
// number is glued to letters that are not a unit ("7up") or sits in the
// middle of the name ("Coca 1.5L zero").
const MAX_QUANTITY = 999;

// Canonical unit by lowercase, accent-free spelling. null is a bare count.
const UNITS: Record<string, string | null> = {
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  g: "g",
  gr: "g",
  grs: "g",
  gramo: "g",
  gramos: "g",
  l: "L",
  lt: "L",
  lts: "L",
  litro: "L",
  litros: "L",
  ml: "ml",
  cc: "ml",
  u: null,
  un: null,
  unid: null,
  unidad: null,
  unidades: null,
};

// Count words are kept as typed (lowercase), singular or plural.
const COUNT_WORDS = new Set(
  [
    "paquete",
    "docena",
    "lata",
    "botella",
    "caja",
    "bandeja",
    "frasco",
    "atado",
    "bolsa",
    "sobre",
    "maple",
    "rollo",
    "pack",
  ].flatMap((word) => [word, `${word}s`]),
);

const GLYPHS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };

// Quantity token, as a capture group. Fraction first so "1/2" is not "1".
const QTY = String.raw`(\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾])`;
const TIMES = "[x×]";

const LEADING_TIMES_BEFORE = new RegExp(`^${TIMES}\\s?${QTY}\\s+(.+)$`, "iu");
const LEADING_TIMES_AFTER = new RegExp(`^${QTY}\\s?${TIMES}\\s+(.+)$`, "iu");
const LEADING_WITH_WORD = new RegExp(`^${QTY}\\s?(\\p{L}+)\\.?\\s+(.+)$`, "u");
const LEADING_PLAIN = new RegExp(`^${QTY}\\s+(.+)$`, "u");
const TRAILING_TIMES_BEFORE = new RegExp(`^(.+?)\\s+${TIMES}\\s?${QTY}$`, "iu");
const TRAILING_TIMES_AFTER = new RegExp(`^(.+?)\\s+${QTY}\\s?${TIMES}$`, "iu");
const TRAILING = new RegExp(`^(.+?)\\s+${QTY}\\s?(?:(\\p{L}+)\\.?)?$`, "u");
const BARE_WORD = /^(\p{L}+)\.?$/u;

function parseQuantity(token: string): number | null {
  let value: number;
  if (token in GLYPHS) {
    value = GLYPHS[token];
  } else if (token.includes("/")) {
    const [numerator, denominator] = token.split("/").map(Number);
    value = numerator / denominator;
  } else {
    value = Number(token.replace(",", "."));
  }
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isFinite(rounded) && rounded > 0 && rounded <= MAX_QUANTITY
    ? rounded
    : null;
}

// Returns the canonical unit (null for a bare count), or undefined when the
// word is not a unit.
function parseUnit(word: string): string | null | undefined {
  const key = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (key in UNITS) return UNITS[key];
  if (COUNT_WORDS.has(key)) return key;
  return undefined;
}

function build(
  name: string,
  qtyToken: string,
  unit: string | null,
): ParsedItemInput | null {
  const quantity = parseQuantity(qtyToken);
  // "Tomates, 2 kg": the separator before the quantity is not part of the name.
  const trimmed = name.replace(/[\s,;:]+$/, "");
  if (quantity === null || trimmed === "") return null;
  return { name: trimmed, quantity, unit };
}

function parseLeading(text: string): ParsedItemInput | null {
  for (const re of [LEADING_TIMES_BEFORE, LEADING_TIMES_AFTER]) {
    const match = re.exec(text);
    if (match) return build(match[2], match[1], null);
  }

  const withWord = LEADING_WITH_WORD.exec(text);
  if (withWord) {
    const unit = parseUnit(withWord[2]);
    if (unit !== undefined) {
      const name = withWord[3].replace(/^de\s+(?=\S)/i, "");
      return build(name, withWord[1], unit);
    }
  }

  const plain = LEADING_PLAIN.exec(text);
  if (plain) {
    // "2 kg" is a name, not a quantity with nothing to buy.
    const bare = BARE_WORD.exec(plain[2]);
    if (bare && parseUnit(bare[1]) !== undefined) return null;
    return build(plain[2], plain[1], null);
  }
  return null;
}

function parseTrailing(text: string): ParsedItemInput | null {
  for (const re of [TRAILING_TIMES_BEFORE, TRAILING_TIMES_AFTER]) {
    const match = re.exec(text);
    if (match) return build(match[1], match[2], null);
  }

  const match = TRAILING.exec(text);
  if (!match) return null;
  const unit = match[3] === undefined ? null : parseUnit(match[3]);
  if (unit === undefined) return null;
  return build(match[1], match[2], unit);
}

export function parseItemInput(text: string): ParsedItemInput {
  const clean = text.replace(/\s+/g, " ").trim();
  return (
    parseLeading(clean) ??
    parseTrailing(clean) ?? { name: clean, quantity: null, unit: null }
  );
}
