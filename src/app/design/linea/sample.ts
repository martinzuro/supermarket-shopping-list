import type { CategoryId } from "@/lib/design/tokens";
import type { CheckedItem } from "@/lib/domain";

/**
 * Three past trips of the prototype, as the order of their checks: the
 * bakery by the door, the dairy at the back. The first one ends with the
 * lemons someone forgot, and the last one goes to the pantry aisle once
 * before the meat; neither moves a whole category.
 */
const tripChecks: readonly (readonly CategoryId[])[] = [
  [
    "panaderia",
    "panaderia",
    "verduras",
    "verduras",
    "verduras",
    "verduras",
    "carnes",
    "carnes",
    "almacen",
    "almacen",
    "almacen",
    "lacteos",
    "lacteos",
    "bebidas",
    "limpieza",
    "verduras",
  ],
  [
    "panaderia",
    "verduras",
    "verduras",
    "verduras",
    "carnes",
    "almacen",
    "almacen",
    "lacteos",
    "lacteos",
    "lacteos",
    "bebidas",
    "bebidas",
    "limpieza",
  ],
  [
    "panaderia",
    "panaderia",
    "verduras",
    "verduras",
    "verduras",
    "verduras",
    "verduras",
    "almacen",
    "carnes",
    "carnes",
    "almacen",
    "almacen",
    "lacteos",
    "limpieza",
    "bebidas",
    "bebidas",
    "limpieza",
  ],
];

const tripDays = ["2026-10-25", "2026-11-01", "2026-11-08"] as const;

/** One check a minute, from 10:00 on each trip's day. */
export const pastTrips: readonly (readonly CheckedItem[])[] = tripChecks.map(
  (checks, trip) =>
    checks.map((categoryId, index) => ({
      categoryId,
      checkedAt: new Date(
        Date.parse(`${tripDays[trip]}T10:00:00Z`) + index * 60_000,
      ).toISOString(),
    })),
);
