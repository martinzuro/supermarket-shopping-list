// Twin of public.normalize_name in the initial schema migration. Both must
// return the same string for every input; see the comment block there.
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ς/g, "σ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}
