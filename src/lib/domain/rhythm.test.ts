import { describe, expect, it } from "vitest";
import { USUAL_WINDOW_DAYS } from "./catalog";
import {
  DEFAULT_LIST_INTERVAL_DAYS,
  daysSince,
  hasRhythm,
  isDue,
  isStillUsual,
  listIntervalDays,
  listRhythmOf,
  periodOf,
  productRhythmOf,
  rhythmKind,
  type KnownRhythm,
} from "./rhythm";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

/** A product with a known gap, last bought `ago` days ago. */
function bought(interval_days: number, ago: number): KnownRhythm {
  return { times_bought: 3, last_bought_at: daysAgo(ago), interval_days };
}

const WEEKLY = DEFAULT_LIST_INTERVAL_DAYS;

describe("listIntervalDays", () => {
  it("is the list's median gap, or a week without one", () => {
    expect(listIntervalDays({ trips_count: 4, interval_days: 10.5 })).toBe(
      10.5,
    );
    expect(listIntervalDays({ trips_count: 1, interval_days: null })).toBe(7);
    expect(listIntervalDays(null)).toBe(7);
    expect(listIntervalDays(undefined)).toBe(7);
  });

  it("takes a median under a day for no pace at all", () => {
    expect(listIntervalDays({ trips_count: 4, interval_days: 0.003 })).toBe(7);
    expect(listIntervalDays({ trips_count: 4, interval_days: 0 })).toBe(7);
    expect(listIntervalDays({ trips_count: 4, interval_days: 1 })).toBe(1);
  });
});

describe("productRhythmOf and listRhythmOf", () => {
  it("take the views' rows, whose columns are nullable to the types only", () => {
    expect(
      productRhythmOf({
        times_bought: 3,
        last_bought_at: daysAgo(1),
        interval_days: 7,
      }),
    ).toEqual({
      times_bought: 3,
      last_bought_at: daysAgo(1),
      interval_days: 7,
    });
    expect(
      productRhythmOf({
        times_bought: 1,
        last_bought_at: daysAgo(1),
        interval_days: null,
      }),
    ).toEqual({
      times_bought: 1,
      last_bought_at: daysAgo(1),
      interval_days: null,
    });
    expect(
      productRhythmOf({
        times_bought: null,
        last_bought_at: null,
        interval_days: null,
      }),
    ).toBeNull();
    expect(listRhythmOf({ trips_count: 2, interval_days: 7 })).toEqual({
      trips_count: 2,
      interval_days: 7,
    });
    expect(listRhythmOf({ trips_count: null, interval_days: null })).toBeNull();
    expect(listRhythmOf(null)).toBeNull();
  });
});

describe("hasRhythm", () => {
  it("needs a gap: a single purchase, or none, tells nothing", () => {
    expect(hasRhythm(bought(7, 1))).toBe(true);
    expect(
      hasRhythm({
        times_bought: 1,
        last_bought_at: daysAgo(1),
        interval_days: null,
      }),
    ).toBe(false);
    expect(hasRhythm(null)).toBe(false);
    expect(hasRhythm(undefined)).toBe(false);
  });
});

describe("rhythmKind", () => {
  it("is of every trip up to one and a half list gaps, periodic beyond", () => {
    expect(rhythmKind(bought(7, 1), WEEKLY)).toBe("every");
    expect(rhythmKind(bought(10.5, 1), WEEKLY)).toBe("every");
    expect(rhythmKind(bought(11, 1), WEEKLY)).toBe("periodic");
    expect(rhythmKind(bought(90, 1), WEEKLY)).toBe("periodic");
  });

  it("follows the list's own pace: weekly water is periodic for a household that shops twice a week", () => {
    expect(rhythmKind(bought(7, 1), 3.5)).toBe("periodic");
    expect(rhythmKind(bought(7, 1), 14)).toBe("every");
  });
});

describe("isDue", () => {
  it("is what runs out before the next trip, one list gap away", () => {
    // Detergent every three weeks: not on the trip a week after buying it,
    // yes on the one two weeks after (it runs out the day of the next trip).
    expect(isDue(bought(21, 7), NOW, WEEKLY)).toBe(false);
    expect(isDue(bought(21, 13), NOW, WEEKLY)).toBe(false);
    expect(isDue(bought(21, 14), NOW, WEEKLY)).toBe(true);
    expect(isDue(bought(21, 30), NOW, WEEKLY)).toBe(true);
  });

  it("is always true for a product of every trip, and late for a quarterly one", () => {
    expect(isDue(bought(7, 0), NOW, WEEKLY)).toBe(true);
    expect(isDue(bought(7, 7), NOW, WEEKLY)).toBe(true);
    // Of every trip by its kind (up to a half more than the list's gap),
    // though the count alone would leave it at home right after buying it.
    expect(isDue(bought(10.5, 0), NOW, WEEKLY)).toBe(true);
    expect(isDue(bought(10.5, 2), NOW, WEEKLY)).toBe(true);
    // The same gap is periodic for a household that shops twice a week.
    expect(isDue(bought(10.5, 2), NOW, 3.5)).toBe(false);
    expect(isDue(bought(90, 82), NOW, WEEKLY)).toBe(false);
    expect(isDue(bought(90, 83), NOW, WEEKLY)).toBe(true);
  });

  it("looks further ahead for a household that shops less often", () => {
    // Every ten days: three weeks is periodic there (over a half more), and
    // the next trip is ten days away.
    expect(isDue(bought(21, 11), NOW, 10)).toBe(true);
    expect(isDue(bought(21, 10), NOW, 10)).toBe(false);
    // Every fortnight: three weeks is of every trip, so always due.
    expect(isDue(bought(21, 6), NOW, 14)).toBe(true);
  });
});

describe("isStillUsual", () => {
  it("keeps a product for twice its gap, and never less than the catalog's window", () => {
    expect(isStillUsual(bought(7, USUAL_WINDOW_DAYS), NOW)).toBe(true);
    expect(isStillUsual(bought(7, USUAL_WINDOW_DAYS + 1), NOW)).toBe(false);
    expect(isStillUsual(bought(90, 180), NOW)).toBe(true);
    expect(isStillUsual(bought(90, 181), NOW)).toBe(false);
  });
});

describe("periodOf", () => {
  it("says days under two weeks, weeks under a month and a half, months from there", () => {
    expect(periodOf(3)).toEqual({ unit: "day", count: 3 });
    expect(periodOf(10.5)).toEqual({ unit: "day", count: 11 });
    expect(periodOf(13.9)).toEqual({ unit: "day", count: 14 });
    expect(periodOf(14)).toEqual({ unit: "week", count: 2 });
    expect(periodOf(24)).toEqual({ unit: "week", count: 3 });
    expect(periodOf(41)).toEqual({ unit: "week", count: 6 });
    // Six weeks are six weeks, never "one month".
    expect(periodOf(42)).toEqual({ unit: "week", count: 6 });
    expect(periodOf(45)).toEqual({ unit: "week", count: 6 });
    expect(periodOf(46)).toEqual({ unit: "month", count: 2 });
    expect(periodOf(60)).toEqual({ unit: "month", count: 2 });
    expect(periodOf(90)).toEqual({ unit: "month", count: 3 });
    expect(periodOf(365)).toEqual({ unit: "month", count: 12 });
  });

  it("never says less than one", () => {
    expect(periodOf(0)).toEqual({ unit: "day", count: 1 });
    expect(periodOf(0.4)).toEqual({ unit: "day", count: 1 });
  });
});

describe("daysSince", () => {
  it("is the whole days since the purchase, never negative", () => {
    expect(daysSince(daysAgo(0), NOW)).toBe(0);
    expect(daysSince(daysAgo(2.9), NOW)).toBe(2);
    expect(daysSince(daysAgo(14), NOW)).toBe(14);
    expect(daysSince(daysAgo(-1), NOW)).toBe(0);
  });
});
