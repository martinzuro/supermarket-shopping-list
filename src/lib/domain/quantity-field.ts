import { MAX_MEASURED_QUANTITY, parseQuantityText } from "./parse-item-input";

// The quantity field of the edit sheet. Same notations and range as the add
// bar ("2", "1,5", "1.5", "1/2", "½"; more than 0 and, since the field is a
// measure as much as a count, up to 99.999 grams or millilitres), but the
// text is the whole field: anything else is invalid instead of staying in a
// name. An empty field means "no quantity".
export function parseQuantityField(text: string): number | null | "invalid" {
  if (text.trim() === "") return null;
  return parseQuantityText(text, MAX_MEASURED_QUANTITY) ?? "invalid";
}

// Prefill for the field: comma decimal, as people write it here, and every
// decimal kept so that an untouched field parses back to the same number.
export function formatQuantityField(quantity: number | null): string {
  return quantity === null ? "" : String(quantity).replace(".", ",");
}
