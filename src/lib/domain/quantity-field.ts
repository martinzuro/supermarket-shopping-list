import { parseQuantityText } from "./parse-item-input";

// The quantity field of the edit sheet. Same notations and range as the add
// bar ("2", "1,5", "1.5", "1/2", "½"; more than 0 and up to 999), but the
// text is the whole field: anything else is invalid instead of staying in a
// name. An empty field means "no quantity".
export function parseQuantityField(text: string): number | null | "invalid" {
  if (text.trim() === "") return null;
  return parseQuantityText(text) ?? "invalid";
}

// Prefill for the field: comma decimal, as people write it here, and every
// decimal kept so that an untouched field parses back to the same number.
export function formatQuantityField(quantity: number | null): string {
  return quantity === null ? "" : String(quantity).replace(".", ",");
}
