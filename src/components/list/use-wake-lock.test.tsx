import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./use-wake-lock";

/** A sentinel as the browser hands it: released by it, or by the page. */
class FakeSentinel extends EventTarget {
  released = false;
  readonly type = "screen";
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
}

type Request = (type: "screen") => Promise<FakeSentinel>;

function installWakeLock(request: Request) {
  const wakeLock = { request: vi.fn(request) };
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    get: () => wakeLock,
  });
  return wakeLock;
}

function removeWakeLock() {
  // jsdom has none: the property only exists while a test installs it.
  Reflect.deleteProperty(navigator, "wakeLock");
}

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
});

afterEach(() => {
  removeWakeLock();
  vi.restoreAllMocks();
});

describe("useWakeLock", () => {
  it("does nothing while not active", () => {
    const wakeLock = installWakeLock(async () => new FakeSentinel());
    const { result } = renderHook(() => useWakeLock(false));
    expect(result.current).toBe("off");
    expect(wakeLock.request).not.toHaveBeenCalled();
  });

  it("without the API, says so and throws nothing", () => {
    removeWakeLock();
    const { result, rerender, unmount } = renderHook(
      ({ active }) => useWakeLock(active),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe("unsupported");
    rerender({ active: false });
    expect(result.current).toBe("off");
    unmount();
  });

  it("holds the screen while active and lets go when it ends", async () => {
    const sentinel = new FakeSentinel();
    const wakeLock = installWakeLock(async () => sentinel);
    const { result, rerender } = renderHook(
      ({ active }) => useWakeLock(active),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe("waiting");
    await waitFor(() => expect(result.current).toBe("held"));
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(wakeLock.request).toHaveBeenCalledWith("screen");

    rerender({ active: false });
    expect(result.current).toBe("off");
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("lets go on unmount", async () => {
    const sentinel = new FakeSentinel();
    installWakeLock(async () => sentinel);
    const { result, unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe("held"));
    unmount();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("asks again when the page is visible after the browser let go", async () => {
    const sentinels: FakeSentinel[] = [];
    const wakeLock = installWakeLock(async () => {
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel;
    });
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe("held"));

    // The page is hidden: the browser releases the lock on its own.
    await act(async () => {
      setVisibility("hidden");
      await sentinels[0].release();
    });
    expect(result.current).toBe("waiting");
    expect(wakeLock.request).toHaveBeenCalledTimes(1);

    // Back on screen: asked for again.
    act(() => setVisibility("visible"));
    await waitFor(() => expect(result.current).toBe("held"));
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it("goes on without it when refused, and asks again on the next touch", async () => {
    let refuse = true;
    const wakeLock = installWakeLock(async () => {
      if (refuse) throw new DOMException("Denied", "NotAllowedError");
      return new FakeSentinel();
    });
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBe("waiting");

    refuse = false;
    act(() => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    await waitFor(() => expect(result.current).toBe("held"));
    expect(wakeLock.request).toHaveBeenCalledTimes(2);

    // Held: touches ask for nothing more.
    act(() => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it("does not ask while the page is hidden", async () => {
    visibility = "hidden";
    const wakeLock = installWakeLock(async () => new FakeSentinel());
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(wakeLock.request).not.toHaveBeenCalled();
    expect(result.current).toBe("waiting");
    act(() => setVisibility("visible"));
    await waitFor(() => expect(result.current).toBe("held"));
  });

  it("lets go of a lock granted after the mode ended", async () => {
    let grant!: (sentinel: FakeSentinel) => void;
    installWakeLock(
      () =>
        new Promise<FakeSentinel>((resolve) => {
          grant = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ active }) => useWakeLock(active),
      { initialProps: { active: true } },
    );
    rerender({ active: false });
    const late = new FakeSentinel();
    await act(async () => grant(late));
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("off");
  });
});
