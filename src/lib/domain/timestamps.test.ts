import { describe, expect, it } from "vitest";
import { compareTimestamps } from "./timestamps";

describe("compareTimestamps", () => {
  it("tells apart two writes within the same millisecond", () => {
    const first = "2026-10-19T15:03:36.996802+00:00";
    const second = "2026-10-19T15:03:36.996951+00:00";
    expect(compareTimestamps(first, second)).toBeLessThan(0);
    expect(compareTimestamps(second, first)).toBeGreaterThan(0);
    expect(compareTimestamps(first, first)).toBe(0);
  });

  it("compares Postgres and JavaScript formats", () => {
    expect(
      compareTimestamps(
        "2026-10-19T15:03:36.996000+00:00",
        "2026-10-19T15:03:36.996Z",
      ),
    ).toBe(0);
    expect(
      compareTimestamps(
        "2026-10-19T15:03:37+00:00",
        "2026-10-19T15:03:36.999Z",
      ),
    ).toBeGreaterThan(0);
  });

  it("honours the offset", () => {
    expect(
      compareTimestamps(
        "2026-10-19T12:00:00.000001-03:00",
        "2026-10-19T15:00:00+00:00",
      ),
    ).toBe(1);
  });
});
