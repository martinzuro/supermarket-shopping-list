import { useRef, type MouseEvent } from "react";

/**
 * Un segundo toque antes de esto y casi en el mismo lugar es un doble toque
 * accidental (el mismo criterio que la confirmación de borrar de la hoja).
 */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_PX = 24;

/**
 * Tells an accidental double tap from a second request: a tap that comes
 * less than DOUBLE_TAP_MS after the previous one, less than DOUBLE_TAP_PX
 * from it, lands on whatever moved under the finger after the first (another
 * option, another pill, the next row of the list). The keyboard
 * (`event.detail === 0`) has no double tap. `reset` forgets the last tap:
 * something done in between (typing) makes the next tap a new request.
 */
export function useDoubleTap() {
  const last = useRef<{ x: number; y: number; at: number } | null>(null);

  function isDoubleTap(event: MouseEvent<HTMLElement>) {
    if (event.detail === 0) return false;
    const now = Date.now();
    const previous = last.current;
    last.current = { x: event.clientX, y: event.clientY, at: now };
    return (
      previous !== null &&
      now - previous.at < DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
        DOUBLE_TAP_PX
    );
  }

  function reset() {
    last.current = null;
  }

  return { isDoubleTap, reset };
}
