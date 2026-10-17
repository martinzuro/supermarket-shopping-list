"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
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
            note={item.note || undefined}
            checked={checked[index]}
            toggleLabel={t.rowToggle(item.name)}
            onCheckedChange={(next) =>
              setChecked((prev) => prev.map((c, i) => (i === index ? next : c)))
            }
            highlighted={highlighted === index}
          />
        ))}
      </ul>
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
