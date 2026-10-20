import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBarHeight } from "./use-bar-height";

const PROPERTY = "--add-bar-measured";

function barAt(top: number) {
  const bar = document.createElement("div");
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
    top,
  } as DOMRect);
  return bar;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(PROPERTY);
});

describe("useBarHeight", () => {
  it("reserves from the top of the bar to the bottom of the window", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(812);
    const ref = { current: barAt(812 - 120) };
    renderHook(() => useBarHeight(ref));
    expect(document.documentElement.style.getPropertyValue(PROPERTY)).toBe(
      "120px",
    );
  });

  it("reserves the keyboard too when it lifts the bar (iOS), and measures again when it moves", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(812);
    const bar = barAt(812 - 120);
    const ref = { current: bar };
    const { rerender } = renderHook(
      ({ inset }: { inset: number }) => useBarHeight(ref, inset),
      { initialProps: { inset: 0 } },
    );
    expect(document.documentElement.style.getPropertyValue(PROPERTY)).toBe(
      "120px",
    );

    // The keyboard opens: the window keeps its height, the bar goes up by
    // `bottom`, and its own size does not change (no resize to observe).
    vi.mocked(bar.getBoundingClientRect).mockReturnValue({
      top: 812 - 120 - 300,
    } as DOMRect);
    rerender({ inset: 300 });
    expect(document.documentElement.style.getPropertyValue(PROPERTY)).toBe(
      "420px",
    );
  });
});
