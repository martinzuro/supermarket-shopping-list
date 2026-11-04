"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * - `off`: not wanted.
 * - `unsupported`: the browser has no Screen Wake Lock API; the screen
 *   dims as usual and nothing else changes.
 * - `waiting`: wanted but not held: being asked for, refused (low battery,
 *   a policy), or let go by the browser while the page was hidden. It is
 *   asked for again when the page comes back and on the next touch.
 * - `held`: the screen stays on.
 */
export type WakeLockStatus = "off" | "unsupported" | "waiting" | "held";

const subscribeNever = () => () => {};
const hasWakeLock = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.wakeLock?.request === "function";

/**
 * Keeps the screen on while `active` (Screen Wake Lock API), for the
 * shopping mode (docs/improvements.md, F-1): between aisles the phone must
 * not lock with the list on it.
 *
 * The browser lets go of the lock whenever the page is hidden (another app,
 * the screen turned off by hand), so it is asked for again when the page is
 * visible. Some browsers only grant it after a touch (a reload, an installed
 * app opened from the home screen): a touch on the page asks again while it
 * is not held. Without the API, or if the browser refuses, everything works
 * as before, without errors. Let go when `active` turns false or on unmount.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  // Only in the browser: prerendered, there is no lock to ask for.
  const supported = useSyncExternalStore(
    subscribeNever,
    hasWakeLock,
    () => false,
  );
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !supported) return;
    const wakeLock = navigator.wakeLock;
    let done = false;
    let sentinel: WakeLockSentinel | null = null;
    let asking = false;

    const onRelease = () => {
      sentinel = null;
      if (!done) setHeld(false);
    };

    async function acquire() {
      if (done || sentinel || asking) return;
      // A hidden page is always refused: it asks when it shows again.
      if (document.visibilityState !== "visible") return;
      asking = true;
      try {
        const next = await wakeLock.request("screen");
        if (done) {
          // Turned off while it was being granted.
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
        next.addEventListener("release", onRelease, { once: true });
        setHeld(true);
      } catch {
        // Refused: the mode goes on with the screen dimming as usual.
      } finally {
        asking = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    const onTouch = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", onTouch, true);
    void acquire();

    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onTouch, true);
      const current = sentinel;
      sentinel = null;
      if (current) {
        current.removeEventListener("release", onRelease);
        void current.release().catch(() => {});
      }
      setHeld(false);
    };
  }, [active, supported]);

  if (!active) return "off";
  if (!supported) return "unsupported";
  return held ? "held" : "waiting";
}
