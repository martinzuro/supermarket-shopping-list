import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestQueryClient, makeWrapper } from "@/lib/queries/test-utils";
import {
  SHOPPING_KEY,
  SHOPPING_MAX_MS,
  useFinishShopping,
  useShoppingFinish,
  useShoppingMode,
} from "./shopping-mode";

const LIST = "00000000-0000-7000-8000-000000000002";
const OTHER = "00000000-0000-7000-8000-000000000003";

function kept() {
  const raw = localStorage.getItem(SHOPPING_KEY);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

function keep(listId: string, since: number) {
  localStorage.setItem(SHOPPING_KEY, JSON.stringify({ listId, since }));
}

function renderMode(listId: string | null) {
  const wrapper = makeWrapper(makeTestQueryClient());
  return renderHook(
    ({ id }: { id: string | null }) => ({
      mode: useShoppingMode(id),
      finish: useFinishShopping(),
    }),
    { wrapper, initialProps: { id: listId } },
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useShoppingMode", () => {
  it("starts and stops for the list on screen, kept on this device", () => {
    vi.useFakeTimers({ now: new Date("2026-11-04T10:00:00Z") });
    const { result } = renderMode(LIST);
    expect(result.current.mode.on).toBe(false);

    act(() => result.current.mode.start());
    expect(result.current.mode.on).toBe(true);
    expect(kept()).toEqual({
      listId: LIST,
      since: new Date("2026-11-04T10:00:00Z").getTime(),
    });

    act(() => result.current.mode.stop());
    expect(result.current.mode.on).toBe(false);
    expect(kept()).toBeNull();
  });

  it("finds a trip kept by an earlier page (a reload)", () => {
    keep(LIST, Date.now() - 60_000);
    const { result } = renderMode(LIST);
    expect(result.current.mode.on).toBe(true);
  });

  it("counts a kept trip while the list is not known yet, not for another list", () => {
    keep(LIST, Date.now());
    const { result, rerender } = renderMode(null);
    expect(result.current.mode.on).toBe(true);
    rerender({ id: OTHER });
    expect(result.current.mode.on).toBe(false);
    rerender({ id: LIST });
    expect(result.current.mode.on).toBe(true);
  });

  it("forgets a trip older than the longest one", () => {
    keep(LIST, Date.now() - SHOPPING_MAX_MS - 1000);
    const { result } = renderMode(LIST);
    expect(result.current.mode.on).toBe(false);
    expect(kept()).toBeNull();
  });

  it("ignores what it cannot read", () => {
    localStorage.setItem(SHOPPING_KEY, "{not json");
    expect(renderMode(LIST).result.current.mode.on).toBe(false);
    localStorage.setItem(SHOPPING_KEY, JSON.stringify({ listId: 3 }));
    expect(renderMode(LIST).result.current.mode.on).toBe(false);
    // A start in the future is a clock that went back: not this trip.
    keep(LIST, Date.now() + 60 * 60 * 1000);
    expect(renderMode(LIST).result.current.mode.on).toBe(false);
  });

  it("follows another tab", () => {
    const { result } = renderMode(LIST);
    act(() => {
      keep(LIST, Date.now());
      window.dispatchEvent(new StorageEvent("storage", { key: SHOPPING_KEY }));
    });
    expect(result.current.mode.on).toBe(true);
    act(() => {
      localStorage.removeItem(SHOPPING_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: SHOPPING_KEY }));
    });
    expect(result.current.mode.on).toBe(false);
  });

  it("ends a trip that went stale while the page was hidden", () => {
    vi.useFakeTimers({ now: new Date("2026-11-04T10:00:00Z") });
    const { result } = renderMode(LIST);
    act(() => result.current.mode.start());
    vi.setSystemTime(Date.now() + SHOPPING_MAX_MS + 1000);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.mode.on).toBe(false);
  });
});

describe("Terminé", () => {
  it("runs what the list registered", () => {
    const wrapper = makeWrapper(makeTestQueryClient());
    const handler = vi.fn();
    const { result } = renderHook(
      () => {
        useShoppingFinish(handler);
        return useFinishShopping();
      },
      { wrapper },
    );
    act(() => result.current());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("without a list on screen, only ends the trip", () => {
    const { result } = renderMode(LIST);
    act(() => result.current.mode.start());
    act(() => result.current.finish());
    expect(result.current.mode.on).toBe(false);
    expect(kept()).toBeNull();
  });
});
