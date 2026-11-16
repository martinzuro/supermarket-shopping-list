import { describe, expect, it } from "vitest";
import { categoryIds } from "@/lib/design/tokens";
import { learnRoute, type CheckedItem, stepsTo } from "./learn-route";
import { pastTrips } from "@/app/design/linea/sample";

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

  it("keeps the list's order with no trips at all", () => {
    expect(learnRoute([], listOrder).learned).toBe(false);
  });

  it("does not count a trip with checks in one category only", () => {
    const route = learnRoute(
      [trip("almacen", "almacen", "almacen"), trip("carnes", "verduras")],
      listOrder,
    );
    expect(route).toEqual({ order: listOrder, trips: 1, learned: false });
  });

  it("skips checks without a readable time", () => {
    const route = learnRoute(
      [
        [
          ...trip("carnes", "verduras"),
          { categoryId: "almacen", checkedAt: "" },
        ],
        trip("carnes", "verduras"),
      ],
      listOrder,
    );
    expect(route.trips).toBe(2);
    // The pantry was never placed: it goes after, in the list's order.
    expect(route.order).toEqual([
      "carnes",
      "verduras",
      "lacteos",
      "panaderia",
      "almacen",
    ]);
  });

  it("averages a category over the trips it appears in only", () => {
    // The dairy shows up once, first: that one trip places it.
    const route = learnRoute(
      [
        trip("lacteos", "carnes", "verduras"),
        trip("carnes", "verduras"),
        trip("carnes", "verduras"),
      ],
      listOrder,
    );
    expect(route.order.slice(0, 3)).toEqual(["lacteos", "carnes", "verduras"]);
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

describe("stepsTo", () => {
  /** Applies the steps as public.move_category does: up, to right before. */
  const apply = (route: string[], steps: { id: string; past: string }[]) => {
    const order = [...route];
    for (const { id, past } of steps) {
      order.splice(order.indexOf(id), 1);
      order.splice(order.indexOf(past), 0, id);
    }
    return order;
  };

  it("needs nothing for the same route", () => {
    expect(stepsTo(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
  });

  it("moves each category out of place once, up to right before another", () => {
    const steps = stepsTo(["a", "b", "c", "d"], ["d", "a", "c", "b"]);
    expect(steps).toEqual([
      { id: "d", past: "a" },
      { id: "c", past: "b" },
    ]);
    expect(apply(["a", "b", "c", "d"], steps)).toEqual(["d", "a", "c", "b"]);
  });

  it("reaches any order", () => {
    const route = ["a", "b", "c", "d", "e"];
    for (const target of [
      ["e", "d", "c", "b", "a"],
      ["b", "a", "d", "c", "e"],
      ["c", "e", "a", "b", "d"],
    ]) {
      const steps = stepsTo(route, target);
      expect(steps.length).toBeLessThan(route.length);
      expect(apply(route, steps)).toEqual(target);
    }
  });

  it("skips what the route does not have", () => {
    expect(stepsTo(["a", "b"], ["x", "b", "a"])).toEqual([
      { id: "b", past: "a" },
    ]);
  });
});
