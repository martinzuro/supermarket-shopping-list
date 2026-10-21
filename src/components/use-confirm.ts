"use client";

import { useEffect, useState } from "react";

/** A confirmation that is not followed by the second tap turns itself off. */
const CONFIRM_MS = 4000;
/**
 * A second tap sooner than this is an accidental double tap, not a
 * confirmation: ignored. The same two numbers as the edit sheet's delete.
 */
const ARM_MS = 350;

/**
 * The light confirmation of the system (the delete of the edit sheet): the
 * first tap on a target asks, a second one a moment later does it. One
 * target at a time, so asking about another one replaces the first. Used to
 * take a member out (members-section.tsx) and to forget a product
 * (products-section.tsx).
 */
export function useConfirm() {
  const [target, setTarget] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (target === null) return;
    const arm = setTimeout(() => setArmed(true), ARM_MS);
    const reset = setTimeout(() => {
      setTarget(null);
      setArmed(false);
    }, CONFIRM_MS);
    return () => {
      clearTimeout(arm);
      clearTimeout(reset);
    };
  }, [target]);

  /** Returns true when this tap is the confirmation. */
  function press(key: string): boolean {
    if (target !== key) {
      setTarget(key);
      setArmed(false);
      return false;
    }
    if (!armed) return false;
    setTarget(null);
    setArmed(false);
    return true;
  }

  return { target, armed, press };
}
