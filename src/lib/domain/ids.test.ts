import { describe, expect, it } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("returns a UUID v7", () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("returns unique ids", () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is sortable by creation time", () => {
    const ids = Array.from({ length: 20 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});
