// A product name with its first letter in capitals (docs/improvements.md,
// M-6): "papel higiénico" becomes "Papel higiénico". Only that one letter
// changes; the rest stays as it was typed, so "Coca-Cola" and "tomates
// Cherry" are never rewritten. normalizeName ignores case, so this never
// changes name_normalized.
//
// What counts as the first letter:
//   * Whatever comes before it is skipped: spaces, emojis, signs ("🍅 tomates"
//     becomes "🍅 Tomates", "¿leche?" becomes "¿Leche?").
//   * A name that starts with a digit is left alone ("7up", "2% leche"): the
//     first letter after it is not the start of the name.
//   * A lowercase letter followed by a capital is a spelling chosen on
//     purpose ("iPhone", "eBay"), not a missed capital: left alone.
//   * A letter whose capital does not go back to it in lowercase is left
//     alone ("ß" is "SS", "µ" is a Greek capital mu that lowercases to "μ"):
//     capitalizing must never change the normalized name.
const FIRST_CHARACTER = /[\p{L}\p{N}]/u;
const DELIBERATE_LOWERCASE = /^\p{Ll}\p{Lu}/u;

export function capitalizeName(name: string): string {
  const first = FIRST_CHARACTER.exec(name);
  if (!first) return name;
  const rest = name.slice(first.index);
  if (DELIBERATE_LOWERCASE.test(rest)) return name;
  const upper = first[0].toUpperCase();
  if (upper.toLowerCase() !== first[0]) return name;
  return name.slice(0, first.index) + upper + rest.slice(first[0].length);
}
