"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
import { Collapse } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "@/components/ui/check-circle";
import { Eyebrow } from "@/components/ui/eyebrow";
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

export type ReviewProduct = {
  /** Estable: el nombre normalizado. */
  key: string;
  name: string;
  category: CategoryId;
  /** La cantidad con que entra, ya formateada ("2 kg"), si la tiene. */
  amount?: string;
  /** Una línea bajo el nombre: cada cuánto se compra (F-7). */
  detail?: string;
  /** Ya está pendiente: se muestra, pero no se agrega otra vez (A-2). */
  inList?: boolean;
  /**
   * Todavía hay en casa (F-7): va en el grupo plegado del final y empieza
   * destildado; se tilda si se acabó antes.
   */
  later?: boolean;
};

type ReviewSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Nombre accesible de la lista. */
  listLabel: string;
  /** Una línea más bajo la descripción ("Solo van los primeros 50"). */
  note?: string;
  products: readonly ReviewProduct[];
  /** Agrega los tildados; quien abre la hoja la cierra. */
  onAdd: (keys: readonly string[]) => void;
  /** A dónde va el foco al cerrar (no hay disparador de Radix). */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * Lo que está por agregarse de una vez, para repasarlo antes: "Lo de
 * siempre" (A-3), una lista pegada en el campo (F-2) y una compra anterior
 * (F-4), en docs/improvements.md. Todo empieza tildado, cada producto con la
 * cantidad con que entra; se destilda lo que no va y "Agregar N" suma el
 * resto en una escritura. Lo que ya está pendiente se ve, sin círculo, con
 * "Ya está en la lista". Con el ritmo de las compras (F-7), "Lo de siempre"
 * trae además lo que todavía hay en casa: va al final, plegado bajo "Todavía
 * tenés" y destildado, y lo que toca lleva arriba el título "Te toca
 * comprar". Hoja desde abajo, filas con el círculo de marcar de la lista.
 */
export function ReviewSheet({
  open,
  onOpenChange,
  onCloseAutoFocus,
  title,
  description,
  ...props
}: ReviewSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-slot="review-sheet"
        onOpenAutoFocus={(event) => {
          // The focus goes to the sheet, not to the first row.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {/* Mounted with the content, so each opening starts as it comes. */}
        <ReviewBody {...props} />
      </SheetContent>
    </Sheet>
  );
}

function ReviewBody({
  products,
  listLabel,
  note,
  onAdd,
}: Pick<ReviewSheetProps, "products" | "listLabel" | "note" | "onAdd">) {
  // What was flipped from how it came (ticked, or unticked for what is
  // still at home), not what is ticked: a product that turns up while the
  // sheet is open (the catalog was read again) comes as the rest of its
  // group.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const due = products.filter((product) => !product.later);
  const later = products.filter((product) => product.later);
  // "Todavía tenés" starts folded, unless nothing is due: then it is all
  // there is to see.
  const [laterOpen, setLaterOpen] = useState(() => due.length === 0);
  const t = texts.addItem.review;

  const isTicked = (product: ReviewProduct) =>
    !product.inList &&
    (product.later ? flipped.has(product.key) : !flipped.has(product.key));
  const ticked = products.filter(isTicked);

  function toggle(key: string) {
    setFlipped((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const rows = (group: readonly ReviewProduct[]) =>
    group.map((product) => {
      const checked = isTicked(product);
      const amount = product.amount ? (
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
      ) : null;
      const detail = product.detail ? (
        <>
          {" "}
          <span
            data-slot="review-detail"
            className="text-label text-ink-2 block text-pretty"
          >
            {product.detail}
          </span>
        </>
      ) : null;
      return (
        // The last rule is the next block's, or the footer's: no double line.
        <li key={product.key} className="border-rule border-b last:border-b-0">
          {product.inList ? (
            // Nothing to tick: the same row, quiet, saying why.
            <div
              data-slot="review-in-list"
              className="min-h-row text-row text-ink-2 flex items-center gap-3"
            >
              <span aria-hidden className="size-6 shrink-0" />
              <CategoryIcon category={product.category} className="size-5" />
              <span className="min-w-0 flex-1 truncate">{product.name}</span>
              {amount} <span className="text-label shrink-0">{t.inList}</span>
            </div>
          ) : (
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              data-slot="review-product"
              onClick={() => toggle(product.key)}
              className="group/review min-h-row text-row flex w-full items-center gap-3 py-2 text-left"
            >
              <CheckCircle
                checked={checked}
                className="group-active/review:scale-90"
              />
              <CategoryIcon
                category={product.category}
                className="text-ink-2 size-5"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "duration-base block truncate transition-colors ease-out",
                    checked ? "text-ink" : "text-ink-2",
                  )}
                >
                  {product.name}
                </span>
                {detail}
              </span>
              {amount}
            </button>
          )}
        </li>
      );
    });

  return (
    <>
      {note ? (
        <p className="text-label text-ink-2 -mt-2 px-6 pb-4 text-pretty">
          {note}
        </p>
      ) : null}
      {later.length > 0 ? (
        <Eyebrow as="h3" className="px-6 pb-2">
          {t.due}
        </Eyebrow>
      ) : null}
      {due.length > 0 ? (
        <ul
          aria-label={listLabel}
          data-slot="review-list"
          className="border-rule mx-6 border-t"
        >
          {rows(due)}
        </ul>
      ) : later.length > 0 ? (
        <p
          data-slot="review-nothing-due"
          className="text-row text-ink-2 border-rule mx-6 border-t py-4"
        >
          {t.nothingDue}
        </p>
      ) : null}
      {later.length > 0 ? (
        <div data-slot="review-later" className="border-rule mx-6 border-t">
          <button
            type="button"
            aria-expanded={laterOpen}
            onClick={() => setLaterOpen((open) => !open)}
            className="min-h-row text-row flex w-full items-center gap-3 text-left"
          >
            <ChevronDown
              aria-hidden
              strokeWidth={1.5}
              className={cn(
                "text-ink-2 duration-base size-6 shrink-0 transition-transform ease-out",
                laterOpen && "rotate-180",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{t.later}</span>{" "}
            <span
              data-numeric
              className="text-label text-ink-2 shrink-0 font-mono"
            >
              {later.length}
            </span>
          </button>
          <Collapse show={laterOpen}>
            <ul aria-label={t.laterLabel} className="border-rule border-t">
              {rows(later)}
            </ul>
          </Collapse>
        </div>
      ) : null}
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
