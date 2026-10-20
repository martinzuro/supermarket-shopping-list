"use client";

import { useState } from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "@/components/ui/check-circle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CategoryId } from "@/lib/design/tokens";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

export type UsualProduct = {
  /** Estable: el nombre normalizado del catálogo. */
  key: string;
  name: string;
  category: CategoryId;
  /** La cantidad con que vuelve, ya formateada ("2 kg"), si la tiene. */
  amount?: string;
};

type UsualsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo habitual que no está pendiente, en el orden del recorrido. */
  products: readonly UsualProduct[];
  /** Agrega los tildados; quien abre la hoja la cierra. */
  onAdd: (keys: readonly string[]) => void;
  /** A dónde va el foco al cerrar (no hay disparador de Radix). */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * "Lo de siempre" (docs/improvements.md, A-3): el repaso de la compra de la
 * semana antes de agregarla. Todo empieza tildado, cada producto con la
 * cantidad con que vuelve; se destilda lo que todavía hay en casa y "Agregar
 * N" suma el resto de una vez. Hoja desde abajo, filas con el círculo de
 * marcar de la lista.
 */
export function UsualsSheet({
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: UsualsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-slot="usuals-sheet"
        onOpenAutoFocus={(event) => {
          // The focus goes to the sheet, not to the first row.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader>
          <SheetTitle>{texts.addItem.usuals.title}</SheetTitle>
          <SheetDescription>
            {texts.addItem.usuals.description}
          </SheetDescription>
        </SheetHeader>
        {/* Mounted with the content, so each opening starts all ticked. */}
        <UsualsBody {...props} />
      </SheetContent>
    </Sheet>
  );
}

function UsualsBody({
  products,
  onAdd,
}: Pick<UsualsSheetProps, "products" | "onAdd">) {
  // What was unticked, not what is ticked: a product that turns up while the
  // sheet is open (the catalog was read again) comes ticked, like the rest.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const ticked = products.filter((product) => !unticked.has(product.key));
  const t = texts.addItem.usuals;

  function toggle(key: string) {
    setUnticked((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <>
      <ul
        aria-label={t.listLabel}
        data-slot="usuals-list"
        className="border-rule mx-6 border-t"
      >
        {products.map((product) => {
          const checked = !unticked.has(product.key);
          return (
            // The last rule is the footer's: no double line under the list.
            <li
              key={product.key}
              className="border-rule border-b last:border-b-0"
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                data-slot="usual"
                onClick={() => toggle(product.key)}
                className="group/usual min-h-row text-row flex w-full items-center gap-3 text-left"
              >
                <CheckCircle
                  checked={checked}
                  className="group-active/usual:scale-90"
                />
                <CategoryIcon
                  category={product.category}
                  className="text-ink-2 size-5"
                />
                <span
                  className={cn(
                    "duration-base min-w-0 flex-1 truncate transition-colors ease-out",
                    checked ? "text-ink" : "text-ink-2",
                  )}
                >
                  {product.name}
                </span>
                {product.amount ? (
                  <>
                    {/* A space for the accessible name ("Tomates 2 kg"); the
                        flex row does not render it. */}{" "}
                    <span
                      data-numeric
                      className="text-label text-ink-2 shrink-0 font-mono"
                    >
                      {product.amount}
                    </span>
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {/* Siempre a la vista: con quince productos la lista pasa el alto. */}
      <SheetFooter className="bg-paper border-rule sticky bottom-0 mt-4 border-t pt-3">
        <Button
          type="button"
          size="touch-lg"
          disabled={ticked.length === 0}
          onClick={() => onAdd(ticked.map((product) => product.key))}
        >
          {ticked.length > 0 ? t.add(ticked.length) : t.none}
        </Button>
      </SheetFooter>
    </>
  );
}
