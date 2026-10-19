import { describe, expect, it } from "vitest";
import { formatQuantity } from "./format-quantity";

describe("formatQuantity", () => {
  it.each([
    [1.5, "kg", "1,5 kg"],
    [0.5, "L", "0,5 L"],
    [2, null, "2"],
    [2, "paquetes", "2 paquetes"],
    [1000, "g", "1000 g"],
    [12345.678, null, "12345,678"],
    [0.3333, "kg", "0,333 kg"],
    [999, null, "999"],
    [null, "L", "L"],
    [null, null, undefined],
  ])("formats (%j, %j) as %j", (quantity, unit, expected) => {
    expect(formatQuantity(quantity, unit)).toBe(expected);
  });

  it("treats an empty unit as no unit", () => {
    expect(formatQuantity(3, "")).toBe("3");
    expect(formatQuantity(null, "")).toBeUndefined();
  });
});
