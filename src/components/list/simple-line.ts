"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The simple list (F-9, ADR 0010): shopping without categories, one station
 * with everything. A preference of this device, like the shopping mode, but
 * kept apart from the trip (`lista:shopping` ends with each one): it is
 * read when a trip starts and stays for the next.
 */
export const SIMPLE_LINE_KEY = "lista:simple-line";

const listeners = new Set<() => void>();
/** What this page chose, where storage cannot be used at all. */
let unsaved: boolean | null = null;

function read() {
  // What could not be saved (storage that reads but does not write) wins.
  if (unsaved !== null) return unsaved;
  try {
    return window.localStorage.getItem(SIMPLE_LINE_KEY) === "1";
  } catch {
    return unsaved ?? false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SIMPLE_LINE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether this device shops without categories, and how to change it. */
export function useSimpleLine(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    try {
      if (next) window.localStorage.setItem(SIMPLE_LINE_KEY, "1");
      else window.localStorage.removeItem(SIMPLE_LINE_KEY);
      unsaved = null;
    } catch {
      unsaved = next;
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [on, set];
}
