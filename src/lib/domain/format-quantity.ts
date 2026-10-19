// No thousands separator: "1.500 g" would read back as 1,5 g, since the add
// bar and the edit sheet take the dot as a decimal point.
const numberFormat = new Intl.NumberFormat("es-UY", {
  maximumFractionDigits: 3,
  useGrouping: false,
});

// Quantity shown in mono at the right of a list row, e.g. "1,5 kg". Returns
// undefined when there is nothing to show.
export function formatQuantity(
  quantity: number | null,
  unit: string | null,
): string | undefined {
  const number = quantity === null ? undefined : numberFormat.format(quantity);
  const parts = [number, unit].filter(
    (part): part is string =>
      part !== undefined && part !== null && part !== "",
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}
