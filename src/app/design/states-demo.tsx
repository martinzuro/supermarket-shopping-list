"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { EstimateLine } from "@/components/list/estimate-line";
import {
  ReviewSheet,
  type ReviewProduct,
} from "@/components/list/review-sheet";
import { Button } from "@/components/ui/button";
import { CategoryChip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { categoryIds, type CategoryId } from "@/lib/design/tokens";
import { texts } from "@/lib/texts";

const t = texts.design.states;
const names = texts.design.categories.names;

/** Selector de categoría: un chip seleccionado a la vez. */
export function ChipPickerDemo() {
  const [selected, setSelected] = useState<CategoryId>("verduras");
  return (
    <div className="flex flex-wrap gap-2">
      {categoryIds.map((id) => (
        <CategoryChip
          key={id}
          category={id}
          interactive
          selected={selected === id}
          onClick={() => setSelected(id)}
        >
          {names[id]}
        </CategoryChip>
      ))}
    </div>
  );
}

/** Filas con marcado real y pulso de cambio remoto. */
export function RowsDemo() {
  const [checked, setChecked] = useState(() =>
    t.rowItems.map((item) => item.checked),
  );
  const [highlighted, setHighlighted] = useState<number | null>(null);

  function simulateRemote() {
    setHighlighted(1);
    window.setTimeout(() => setHighlighted(null), 1200);
  }

  return (
    <div>
      <ul className="border-rule border-t">
        {t.rowItems.map((item, index) => (
          <ListRow
            key={item.name}
            name={item.name}
            quantity={item.quantity || undefined}
            total={item.total || undefined}
            note={item.note || undefined}
            checked={checked[index]}
            onCheckedChange={(next) =>
              setChecked((prev) => prev.map((c, i) => (i === index ? next : c)))
            }
            highlighted={highlighted === index}
          />
        ))}
      </ul>
      <EstimateLine
        estimate={{
          totals: [
            { currency: "UYU", total: 135 },
            { currency: "USD", total: 4 },
          ],
          priced: 2,
          count: 3,
        }}
      />
      <Button
        type="button"
        variant="link"
        className="mt-4"
        onClick={simulateRemote}
      >
        {t.rowHighlight}
      </Button>
    </div>
  );
}

/**
 * La hoja de repaso de "Lo de siempre" con el ritmo de las compras (F-7):
 * arriba lo que toca, tildado y con su ritmo; plegado al final, lo que
 * todavía hay en casa, destildado.
 */
export function ReviewSheetDemo() {
  const [open, setOpen] = useState(false);
  const products: ReviewProduct[] = [
    ...t.review.due.map((product) => ({ key: product.name, ...product })),
    ...t.review.later.map((product) => ({
      key: product.name,
      ...product,
      later: true,
    })),
  ];
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t.review.open}
      </Button>
      <ReviewSheet
        open={open}
        onOpenChange={setOpen}
        title={texts.addItem.usuals.title}
        description={texts.addItem.usuals.descriptionRhythm}
        listLabel={texts.addItem.usuals.listLabel}
        products={products}
        onAdd={() => setOpen(false)}
      />
    </>
  );
}

/** Hoja real abierta desde un botón, por la derecha y desde abajo. */
export function SheetDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      {(["right", "bottom"] as const).map((side) => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button variant="secondary">
              {side === "right" ? t.sheet.open : t.sheet.openBottom}
            </Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>{t.sheet.title}</SheetTitle>
              <SheetDescription>{t.sheet.description}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <Field label={t.sheet.fieldLabel}>
                <Input
                  readOnly
                  value={t.sheet.fieldValue}
                  className="font-mono"
                />
              </Field>
            </SheetBody>
            <SheetFooter>
              <Button type="button">
                <Link2 aria-hidden strokeWidth={1.5} />
                {t.sheet.confirm}
              </Button>
              <Button type="button" variant="ghost">
                {t.sheet.cancel}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  );
}
