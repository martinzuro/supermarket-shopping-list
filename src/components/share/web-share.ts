import { useSyncExternalStore } from "react";

/**
 * Sharing with the Web Share API where the browser has it, and copying
 * otherwise: the invitation link (ShareSheet) and the pending list (F-3,
 * SendPending).
 */

const noopSubscribe = () => () => {};
const getCanShare = () => typeof navigator.share === "function";
const getServerCanShare = () => false;

/** Whether the browser has the Web Share API (never on the server). */
export function useCanShare() {
  return useSyncExternalStore(noopSubscribe, getCanShare, getServerCanShare);
}

/**
 * What came of it: handed to the share sheet, closed by the person (nothing
 * to say), copied, or not even copied (the text is to be copied by hand).
 */
export type ShareOutcome = "shared" | "cancelled" | "copied" | "failed";

/**
 * Hands `data` to the share sheet of the system, if there is data to share
 * and the browser can; any failure but the person closing it falls back to
 * copying `copy`. Call it straight from the tap: the browser asks for one.
 */
export async function shareOrCopy(
  data: ShareData | null,
  copy: string,
): Promise<ShareOutcome> {
  if (data && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      // The person closed the share sheet: nothing to say.
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  try {
    await navigator.clipboard.writeText(copy);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Puts the text of an element in the selection, to copy it by hand. */
export function selectText(element: HTMLElement | null) {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
