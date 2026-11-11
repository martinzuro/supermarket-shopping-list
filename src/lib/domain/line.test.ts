import { describe, expect, it } from "vitest";
import {
  CHECKOUT,
  SIMPLE_STATION,
  behindOf,
  moveTo,
  nextStop,
  pendingIn,
  reconcileLine,
  startOf,
  stationsOf,
  type LineItem,
} from "./line";

const route = ["pan", "verduras", "carnes", "almacen", "lacteos"];

function item(station: string, checked = false): LineItem {
  return { station, checked };
}

const items = [
  item("pan", true),
  item("verduras"),
  item("verduras", true),
  item("almacen"),
  item("lacteos"),
];
const stations = ["pan", "verduras", "almacen", "lacteos"];

describe("stationsOf", () => {
  it("keeps the route's stations that have something, in route order", () => {
    expect(stationsOf(route, items)).toEqual(stations);
  });

  it("is one station for the simple list", () => {
    expect(
      stationsOf(
        [SIMPLE_STATION],
        [item(SIMPLE_STATION), item(SIMPLE_STATION)],
      ),
    ).toEqual([SIMPLE_STATION]);
  });

  it("is empty without items", () => {
    expect(stationsOf(route, [])).toEqual([]);
  });
});

describe("pendingIn", () => {
  it("counts what is left to pick in a station", () => {
    expect(pendingIn(items, "verduras")).toBe(1);
    expect(pendingIn(items, "pan")).toBe(0);
    expect(pendingIn(items, "carnes")).toBe(0);
  });
});

describe("startOf", () => {
  it("starts at the first station with something to pick", () => {
    expect(startOf(stations, items)).toEqual({
      at: "verduras",
      passed: ["pan"],
    });
  });

  it("starts at the checkout with nothing to pick", () => {
    expect(startOf(["pan"], [item("pan", true)])).toEqual({
      at: CHECKOUT,
      passed: ["pan"],
    });
    expect(startOf([], [])).toEqual({ at: CHECKOUT, passed: [] });
  });
});

describe("nextStop", () => {
  it("is the next station ahead with something to pick", () => {
    expect(nextStop(stations, items, { at: "pan", passed: [] })).toBe(
      "verduras",
    );
  });

  it("skips the stations with everything in the cart", () => {
    const done = items.map((one) =>
      one.station === "almacen" ? { ...one, checked: true } : one,
    );
    expect(nextStop(stations, done, { at: "verduras", passed: ["pan"] })).toBe(
      "lacteos",
    );
  });

  it("skips the stations already passed, even with something pending", () => {
    expect(
      nextStop(stations, items, { at: "pan", passed: ["verduras", "almacen"] }),
    ).toBe("lacteos");
  });

  it("is the checkout after the last station", () => {
    expect(nextStop(stations, items, { at: "lacteos", passed: [] })).toBe(
      CHECKOUT,
    );
    expect(nextStop(stations, items, { at: CHECKOUT, passed: stations })).toBe(
      CHECKOUT,
    );
  });
});

describe("moveTo", () => {
  it("passes the station left and the ones walked through", () => {
    expect(moveTo(stations, { at: "pan", passed: [] }, "almacen")).toEqual({
      at: "almacen",
      passed: ["pan", "verduras"],
    });
  });

  it("leaves the station left ahead again when going back", () => {
    expect(
      moveTo(stations, { at: "almacen", passed: ["pan", "verduras"] }, "pan"),
    ).toEqual({ at: "pan", passed: ["verduras"] });
  });

  it("passes every station at the checkout", () => {
    expect(moveTo(stations, { at: "pan", passed: [] }, CHECKOUT)).toEqual({
      at: CHECKOUT,
      passed: stations,
    });
  });

  it("comes back from the checkout with the rest still passed", () => {
    expect(
      moveTo(stations, { at: CHECKOUT, passed: stations }, "verduras"),
    ).toEqual({ at: "verduras", passed: ["pan", "almacen", "lacteos"] });
  });

  it("does not move to where it is, or to a stop off the line", () => {
    const position = { at: "pan", passed: [] };
    expect(moveTo(stations, position, "pan")).toBe(position);
    expect(moveTo(stations, position, "carnes")).toBe(position);
  });
});

describe("behindOf", () => {
  it("is the passed stations with something still to pick", () => {
    expect(
      behindOf(stations, items, { at: "lacteos", passed: ["pan", "verduras"] }),
    ).toEqual(new Map([["verduras", 1]]));
  });

  it("is everything pending at the checkout", () => {
    expect(
      behindOf(stations, items, { at: CHECKOUT, passed: stations }),
    ).toEqual(
      new Map([
        ["verduras", 1],
        ["almacen", 1],
        ["lacteos", 1],
      ]),
    );
  });
});

describe("reconcileLine", () => {
  it("keeps the same position when nothing about it changed", () => {
    const position = { at: "almacen", passed: ["pan", "verduras"] };
    expect(reconcileLine(stations, stations, position)).toBe(position);
  });

  it("leaves behind a station new to the trip that lands above you", () => {
    const now = ["pan", "verduras", "carnes", "almacen", "lacteos"];
    expect(
      reconcileLine(stations, now, {
        at: "almacen",
        passed: ["pan", "verduras"],
      }),
    ).toEqual({ at: "almacen", passed: ["pan", "verduras", "carnes"] });
  });

  it("leaves ahead a station new to the trip that lands below you", () => {
    const position = { at: "verduras", passed: ["pan"] };
    const now = ["pan", "verduras", "carnes", "almacen", "lacteos"];
    expect(reconcileLine(stations, now, position)).toBe(position);
  });

  it("stands at the next station when yours is gone", () => {
    expect(
      reconcileLine(stations, ["pan", "almacen", "lacteos"], {
        at: "verduras",
        passed: ["pan"],
      }),
    ).toEqual({ at: "almacen", passed: ["pan"] });
  });

  it("stands at the checkout when yours was the last and is gone", () => {
    expect(
      reconcileLine(stations, ["pan", "verduras", "almacen"], {
        at: "lacteos",
        passed: ["pan"],
      }),
    ).toEqual({ at: CHECKOUT, passed: ["pan", "verduras", "almacen"] });
  });

  it("drops the passed stations that are gone", () => {
    expect(
      reconcileLine(stations, ["verduras", "almacen", "lacteos"], {
        at: "almacen",
        passed: ["pan", "verduras"],
      }),
    ).toEqual({ at: "almacen", passed: ["verduras"] });
  });

  it("leaves behind what a reordered route moves above you", () => {
    // "lacteos" was ahead and unvisited: above you, nothing would lead to
    // it again unless it counts as left behind.
    const now = ["lacteos", "pan", "verduras", "almacen"];
    const position = reconcileLine(stations, now, {
      at: "almacen",
      passed: ["pan"],
    });
    expect(position).toEqual({
      at: "almacen",
      passed: ["lacteos", "pan", "verduras"],
    });
    expect(behindOf(now, items, position)).toEqual(
      new Map([
        ["lacteos", 1],
        ["verduras", 1],
      ]),
    );
  });

  it("keeps what was passed when the route moves it below you", () => {
    expect(
      reconcileLine(stations, ["verduras", "almacen", "pan", "lacteos"], {
        at: "almacen",
        passed: ["pan", "verduras"],
      }),
    ).toEqual({ at: "almacen", passed: ["verduras", "pan"] });
  });

  it("passes a station that appears while at the checkout", () => {
    expect(
      reconcileLine(stations, [...stations, "limpieza"], {
        at: CHECKOUT,
        passed: stations,
      }),
    ).toEqual({ at: CHECKOUT, passed: [...stations, "limpieza"] });
  });
});
