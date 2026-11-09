"use client";

import { ShoppingCart } from "lucide-react";
import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  SHOPPING_START_ID,
  useShoppingMode,
} from "@/components/list/shopping-mode";
import { useWakeLock } from "@/components/list/use-wake-lock";
import { Enter, transitions } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { splitByChecked } from "@/lib/domain";
import { currentListOf, useItems, useLists } from "@/lib/queries";
import { texts } from "@/lib/texts";

const SHOPPING_EXIT_ID = "shopping-exit";

type ListMastheadProps = {
  /** The header's own actions (share, menu): hidden, not gone, while shopping. */
  actions: ReactNode;
};

/**
 * The list header's content: the wordmark and its actions, or, while this
 * device is shopping (docs/improvements.md, F-1), the masthead of the
 * supermarket. "Comprando" over how much is in the cart in the serif of the
 * wordmark ("7 de 18"), a 2px line on the header's rule that fills as rows
 * go to the cart, and "Salir". Sharing and the menu wait until the trip is
 * over (kept mounted, so a code being typed in them is not lost). The
 * screen stays on meanwhile (useWakeLock).
 */
export function ListMasthead({ actions }: ListMastheadProps) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const listId = currentListOf(useLists(userId).data)?.id ?? null;
  const items = useItems(userId, listId);
  const shopping = useShoppingMode(listId);
  const wakeLock = useWakeLock(shopping.on);

  // What the data says, not what the rows show: the line moves on the tap,
  // while the checked row still lingers in its place.
  const { pending, cart } = splitByChecked(items.data ?? []);
  const total = pending.length + cart.length;
  const done = cart.length;
  const known = items.data !== undefined && listId !== null;

  // The masthead animates only when the user toggles it, not when a reload
  // finds the mode on.
  const [toggled, setToggled] = useState(false);
  // The button that was used is gone with its state: the focus goes to the
  // other one, if it was left on nothing.
  const moveFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = moveFocus.current;
    if (id === null) return;
    moveFocus.current = null;
    const active = document.activeElement;
    if (!active || active === document.body) {
      document.getElementById(id)?.focus({ preventScroll: true });
    }
  });

  function start() {
    setToggled(true);
    moveFocus.current = SHOPPING_EXIT_ID;
    shopping.start();
  }

  function exit() {
    setToggled(true);
    moveFocus.current = SHOPPING_START_ID;
    shopping.stop();
  }

  const enter = toggled ? {} : { initial: false as const };

  return (
    <>
      {shopping.on ? (
        <Enter
          key="shopping"
          data-slot="shopping-masthead"
          data-wake-lock={wakeLock}
          {...enter}
        >
          <h1 className="flex flex-col">
            <span className="eyebrow">{texts.shopping.eyebrow}</span>
            <span data-slot="shopping-count" className="text-title font-serif">
              {known ? texts.shopping.progress(done, total) : null}
              <span className="sr-only">{texts.shopping.progressTail}</span>
            </span>
          </h1>
        </Enter>
      ) : (
        <Enter key="wordmark" {...enter}>
          <h1 className="text-title font-serif">{texts.app.name}</h1>
        </Enter>
      )}
      {/* One container in both states: the actions keep their place in the
          tree, and their state (a sign-in code being typed), while hidden. */}
      <div className="flex items-center gap-1">
        {shopping.on ? (
          <Button
            id={SHOPPING_EXIT_ID}
            type="button"
            variant="ghost"
            aria-label={texts.shopping.exitAria}
            onClick={exit}
          >
            {texts.shopping.exit}
          </Button>
        ) : known && total > 0 ? (
          <Button
            id={SHOPPING_START_ID}
            type="button"
            variant="secondary"
            onClick={start}
          >
            <ShoppingCart aria-hidden strokeWidth={1.5} className="size-4" />
            {texts.shopping.start}
          </Button>
        ) : null}
        <div hidden={shopping.on} className="flex items-center">
          {actions}
        </div>
      </div>
      {shopping.on ? (
        // The header's rule, filled as the cart fills: in the "done" pair
        // (tinta en claro, lima en oscuro), only by its scale.
        <motion.div
          aria-hidden
          data-slot="shopping-progress"
          className="bg-action-bg pointer-events-none absolute inset-x-0 -bottom-px h-0.5 origin-left"
          initial={toggled ? { scaleX: 0 } : false}
          animate={{ scaleX: total > 0 ? done / total : 0 }}
          transition={transitions.base}
        />
      ) : null}
    </>
  );
}
