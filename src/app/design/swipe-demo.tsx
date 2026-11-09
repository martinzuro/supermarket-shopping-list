"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { SwipeToRemove } from "@/components/ui/swipe-to-remove";
import { texts } from "@/lib/texts";

const t = texts.design.states.swipe;

/**
 * Muestra de deslizar para borrar (M-9) con filas de verdad: la última va
 * quieta, como una del carro (`disabled`). Lo borrado vuelve con el botón.
 */
export function SwipeDemo() {
  const [gone, setGone] = useState<readonly string[]>([]);
  return (
    <div>
      <ul className="border-rule border-t">
        {t.items.map((name, index) =>
          gone.includes(name) ? null : (
            <li key={name}>
              <SwipeToRemove
                label={texts.list.removed.swipe}
                disabled={index === t.items.length - 1}
                onRemove={() => setGone((names) => [...names, name])}
              >
                <ListRow
                  as="div"
                  name={name}
                  checked={index === t.items.length - 1}
                />
              </SwipeToRemove>
            </li>
          ),
        )}
      </ul>
      <Button
        type="button"
        variant="link"
        className="mt-2"
        disabled={gone.length === 0}
        onClick={() => setGone([])}
      >
        {t.reset}
      </Button>
    </div>
  );
}
