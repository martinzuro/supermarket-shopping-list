import { describe, expect, it } from "vitest";
import { formatQuantityField, parseQuantityField } from "./quantity-field";

describe("parseQuantityField", () => {
  it.each<[string, number]>([
    ["2", 2],
    ["1,5", 1.5],
    ["1.5", 1.5],
    ["0,25", 0.25],
    ["1/2", 0.5],
    ["1/3", 0.333],
    ["½", 0.5],
    ["¼", 0.25],
    ["¾", 0.75],
    ["999", 999],
    ["  3  ", 3],
  ])("accepts %j", (text, expected) => {
    expect(parseQuantityField(text)).toBe(expected);
  });

  it.each(["", "   "])("treats %j as no quantity", (text) => {
    expect(parseQuantityField(text)).toBeNull();
  });

  it.each([
    "0",
    "0,0",
    "1000",
    "999,5",
    "-1",
    "abc",
    "2 kg",
    "1 ½",
    "1/0",
    "0/5",
    "1,",
    ",5",
    "1,5,2",
    "x3",
  ])("rejects %j", (text) => {
    expect(parseQuantityField(text)).toBe("invalid");
  });
});

describe("formatQuantityField", () => {
  it("shows no quantity as an empty field", () => {
    expect(formatQuantityField(null)).toBe("");
  });

  it("uses a comma for the decimal", () => {
    expect(formatQuantityField(1.5)).toBe("1,5");
    expect(formatQuantityField(0.25)).toBe("0,25");
    expect(formatQuantityField(2)).toBe("2");
  });

  it("parses back to the same number", () => {
    for (const quantity of [1, 1.5, 0.333, 12.25, 999]) {
      expect(parseQuantityField(formatQuantityField(quantity))).toBe(quantity);
    }
  });
});
