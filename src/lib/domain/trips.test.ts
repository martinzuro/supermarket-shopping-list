import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/supabase/database.types";
import {
  formatTripDate,
  formatTripTime,
  sameDay,
  tripAgain,
  tripEstimate,
} from "./trips";

const NOW = "2026-10-18T00:00:00Z";

/** An instant at this local time, whatever the machine's time zone. */
const local = (...parts: [number, number, number, number?, number?]) => {
  const [year, month, day, hours = 12, minutes = 0] = parts;
  return new Date(year, month - 1, day, hours, minutes).toISOString();
};

function category(id: string, name: string, position: number) {
  return {
    id,
    list_id: "list",
    name,
    position,
    is_default: true,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  } satisfies Tables<"categories">;
}

function item(
  name: string,
  overrides: Partial<Tables<"items">> = {},
): Tables<"items"> {
  return {
    id: name,
    list_id: "list",
    name,
    name_normalized: name.toLowerCase(),
    category_id: null,
    checked: true,
    checked_at: NOW,
    created_at: NOW,
    created_by: null,
    currency: "UYU",
    // Archived by the emptying, as every row of a trip.
    deleted_at: NOW,
    trip_id: "trip",
    estimated_price: null,
    note: null,
    position: 0,
    quantity: null,
    unit: null,
    updated_at: NOW,
    ...overrides,
  };
}

const entry = (name: string, categoryId: string | null) => ({
  name_normalized: name.toLowerCase(),
  last_category_id: categoryId,
});

describe("formatTripDate", () => {
  const now = new Date(local(2026, 10, 21));

  it("names the day with its weekday, capitalized", () => {
    expect(formatTripDate(local(2026, 10, 20, 18, 40), now)).toBe(
      "Martes 20 de octubre",
    );
    expect(formatTripDate(local(2026, 10, 21, 9, 0), now)).toBe(
      "Miércoles 21 de octubre",
    );
    expect(formatTripDate(local(2026, 10, 3), now)).toBe("Sábado 3 de octubre");
  });

  it("adds the year only when it is not this one's", () => {
    expect(formatTripDate(local(2025, 12, 27), now)).toBe(
      "Sábado 27 de diciembre de 2025",
    );
  });

  it("reads the instant however the server or the client wrote it", () => {
    const instant = local(2026, 10, 21, 18, 40);
    expect(formatTripDate(instant.replace("Z", "+00:00"), now)).toBe(
      formatTripDate(instant, now),
    );
  });
});

describe("formatTripTime and sameDay", () => {
  it("gives the time in 24 hours", () => {
    expect(formatTripTime(local(2026, 10, 21, 9, 5))).toBe("09:05");
    expect(formatTripTime(local(2026, 10, 21, 18, 40))).toBe("18:40");
  });

  it("tells whether two trips fall on the same day here", () => {
    expect(
      sameDay(local(2026, 10, 21, 0, 10), local(2026, 10, 21, 23, 50)),
    ).toBe(true);
    expect(
      sameDay(local(2026, 10, 21, 23, 50), local(2026, 10, 22, 0, 10)),
    ).toBe(false);
  });
});

describe("tripEstimate", () => {
  it("adds up the archived rows by currency, at the prices they had", () => {
    const estimate = tripEstimate([
      item("Tomates", { quantity: 2, unit: "kg", estimated_price: 90 }),
      item("Leche", { quantity: 3, estimated_price: 45 }),
      item("Vino", { estimated_price: 12, currency: "USD" }),
      item("Pan"),
    ]);
    expect(estimate).toEqual({
      totals: [
        { currency: "UYU", total: 315 },
        { currency: "USD", total: 12 },
      ],
      priced: 3,
      count: 4,
    });
  });
});

describe("tripAgain", () => {
  const categories = [
    category("lacteos", "Fiambres y lácteos", 2),
    category("verduras", "Frutas y verduras", 0),
    category("otros", "Otros", 9),
  ];

  it("goes in route order, by the category each product would land in now", () => {
    const again = tripAgain(
      [
        item("Leche", { position: 0 }),
        // Pendientes had it in Otros; the catalog has learned better.
        item("Tomates", { position: 1, category_id: "otros" }),
        item("Pilas", { position: 2, category_id: "verduras" }),
      ],
      [entry("Leche", "lacteos"), entry("Tomates", "verduras")],
      categories,
    );
    expect(again.map((one) => [one.name, one.category_id])).toEqual([
      ["Tomates", "verduras"],
      ["Leche", "lacteos"],
      // Forgotten by the catalog: no category, so "Otros", as any add.
      ["Pilas", null],
    ]);
  });

  it("keeps each product once, the first row of it", () => {
    const again = tripAgain(
      [
        item("Pan", { id: "a", position: 0, quantity: 2 }),
        item("Leche", { position: 1 }),
        item("pan", { id: "b", position: 2 }),
      ],
      [],
      categories,
    );
    expect(again.map((one) => [one.id, one.quantity])).toEqual([
      ["a", 2],
      ["Leche", null],
    ]);
  });

  it("keeps the quantity and the unit each row went with", () => {
    const [tomatoes] = tripAgain(
      [item("Tomates", { quantity: 2, unit: "kg" })],
      [],
      categories,
    );
    expect(tomatoes).toMatchObject({ quantity: 2, unit: "kg" });
  });
});
