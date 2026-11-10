import { act, renderHook } from "@testing-library/react";
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

  describe("with the page at its end, nothing moves under the finger", () => {
    // A page of 1000px of content plus the reserve, in a window of 812px.
    const CONTENT = 1000;
    let scrollY = 0;
    let resize: () => void = () => {};

    function reserved() {
      return Number.parseFloat(
        document.documentElement.style.getPropertyValue(PROPERTY) || "0",
      );
    }

    function setUp(initial: number) {
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(812);
      vi.spyOn(
        document.documentElement,
        "scrollHeight",
        "get",
      ).mockImplementation(() => CONTENT + reserved());
      vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
      vi.spyOn(window, "scrollTo").mockImplementation(((
        options: ScrollToOptions,
      ) => {
        scrollY = options.top ?? scrollY;
      }) as typeof window.scrollTo);
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: () => void) {
            resize = callback;
          }
          observe() {}
          disconnect() {}
        },
      );
      const bar = barAt(812 - initial);
      document.body.append(bar);
      const ref = { current: bar };
      renderHook(() => useBarHeight(ref));
      // At the end of the page.
      scrollY = CONTENT + reserved() - 812;
      return {
        bar,
        to(height: number) {
          vi.mocked(bar.getBoundingClientRect).mockReturnValue({
            top: 812 - height,
          } as DOMRect);
          act(() => resize());
        },
      };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      document.body.replaceChildren();
      scrollY = 0;
    });

    it("a bar that shrinks keeps what the scroll needs, and lets it go as the person scrolls up", () => {
      const { to } = setUp(129);
      const end = scrollY;
      expect(end).toBe(1000 + 129 - 812);

      // The row of frequents goes: the reserve stays, the scroll too.
      to(77);
      expect(reserved()).toBe(129);
      expect(scrollY + 812).toBeLessThanOrEqual(1000 + reserved());
      expect(scrollY).toBe(end);

      // Up by 30px: 30px of the reserve go, still out of view.
      scrollY = end - 30;
      act(() => window.dispatchEvent(new Event("scroll")));
      expect(reserved()).toBe(99);
      // Further up, down to the bar's own height, never below it.
      scrollY = 0;
      act(() => window.dispatchEvent(new Event("scroll")));
      expect(reserved()).toBe(77);
    });

    it("a bar that grows with a notice leaves the page where it is when the person is on the list", () => {
      const { to } = setUp(77);
      const end = scrollY;
      to(209);
      expect(reserved()).toBe(209);
      expect(window.scrollTo).not.toHaveBeenCalled();
      expect(scrollY).toBe(end);
    });

    it("a bar that grows while the person types in it keeps the end of the page in view", () => {
      const { bar, to } = setUp(77);
      const input = document.createElement("input");
      bar.append(input);
      input.focus();
      to(209);
      expect(reserved()).toBe(209);
      expect(scrollY).toBe(1000 + 209 - 812);
    });
  });
});
