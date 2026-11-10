import { describe, expect, it } from "vitest";
import { categoryIds } from "@/lib/design/tokens";
import { learnRoute, type CheckedItem } from "./learn-route";
import { pastTrips } from "./sample";

const listOrder = ["verduras", "carnes", "lacteos", "panaderia", "almacen"];

/** A trip from the order of its checks, one a minute. */
function trip(...categories: string[]): CheckedItem[] {
  return categories.map((categoryId, index) => ({
    categoryId,
    checkedAt: new Date(Date.UTC(2026, 10, 1, 10, index)).toISOString(),
  }));
}

describe("learnRoute", () => {
  it("keeps the list's order with fewer trips than needed", () => {
    const route = learnRoute([trip("panaderia", "verduras")], listOrder);
    expect(route).toEqual({ order: listOrder, trips: 1, learned: false });
  });

  it("orders the categories as past trips checked them", () => {
    const route = learnRoute(
      [
        trip("panaderia", "verduras", "almacen", "lacteos"),
        trip("panaderia", "verduras", "verduras", "almacen", "lacteos"),
      ],
      listOrder,
    );
    expect(route.learned).toBe(true);
    expect(route.trips).toBe(2);
    expect(route.order.slice(0, 4)).toEqual([
      "panaderia",
      "verduras",
      "almacen",
      "lacteos",
    ]);
  });

  it("does not let one product picked on the way out move its category", () => {
    const route = learnRoute(
      [
        trip("verduras", "verduras", "verduras", "almacen", "verduras"),
        trip("verduras", "verduras", "almacen"),
      ],
      listOrder,
    );
    expect(route.order.indexOf("verduras")).toBeLessThan(
      route.order.indexOf("almacen"),
    );
  });

  it("reads the checks by time, not by the order they come in", () => {
    const [first, second] = trip("panaderia", "verduras");
    const route = learnRoute(
      [
        [second, first],
        [second, first],
      ],
      listOrder,
    );
    expect(route.order.slice(0, 2)).toEqual(["panaderia", "verduras"]);
  });

  it("puts unseen categories after the learned ones, in the list's order", () => {
    const route = learnRoute(
      [trip("almacen", "carnes"), trip("almacen", "carnes")],
      listOrder,
    );
    expect(route.order).toEqual([
      "almacen",
      "carnes",
      "verduras",
      "lacteos",
      "panaderia",
    ]);
  });

  it("breaks ties with the list's order", () => {
    // Each trip puts the two at opposite ends: both average one half.
    const route = learnRoute(
      [trip("lacteos", "carnes"), trip("carnes", "lacteos")],
      listOrder,
    );
    expect(route.order.slice(0, 2)).toEqual(["carnes", "lacteos"]);
  });

  it("ignores checks in categories the list no longer has", () => {
    const route = learnRoute(
      [trip("gone", "almacen"), trip("gone", "almacen")],
      listOrder,
    );
    // A single known check per trip: no order to learn.
    expect(route.learned).toBe(false);
    expect(route.order).toEqual(listOrder);
  });

  it("learns the prototype's sample: bakery first, dairy near the end", () => {
    const route = learnRoute(pastTrips, categoryIds);
    expect(route.trips).toBe(3);
    expect(route.order).toEqual([
      "panaderia",
      "verduras",
      "carnes",
      "almacen",
      "lacteos",
      "bebidas",
      "limpieza",
      "congelados",
      "higiene",
      "otros",
    ]);
  });
});
