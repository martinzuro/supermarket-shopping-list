"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ADD_ITEM_INPUT_ID,
  MAX_NAME_LENGTH,
} from "@/components/list/add-item-bar";
import { useKeyboardInset } from "@/components/list/use-keyboard-inset";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  canonicalUnit,
  formatQuantityField,
  parseQuantityField,
} from "@/lib/domain";
import type { EditableFields, Item } from "@/lib/queries";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

/**
 * La nota es corta a propósito: la fila la muestra en una línea. La columna
 * `items.note` admite 2000.
 */
const MAX_NOTE_LENGTH = 200;
/** Mismo límite que la columna `items.unit`. */
const MAX_UNIT_LENGTH = 30;

/** La confirmación de borrar se apaga sola si no llega el segundo toque. */
const CONFIRM_MS = 4000;
/**
 * Un segundo toque antes de esto es un doble toque accidental, no una
 * confirmación: se ignora, y el botón queda "armado" recién después.
 */
const ARM_MS = 350;

type EditItemSheetProps = {
  /**
   * El ítem que se edita, tal como está ahora en la lista, o `undefined` con
   * la hoja cerrada. Si desaparece con la hoja abierta (se deshizo o lo
   * borró otro), la hoja se cierra sola.
   */
  item: Item | undefined;
  /** Solo los campos que cambiaron. No se llama si no cambió nada. */
  onSave: (item: Item, changes: Partial<EditableFields>) => void;
  onRemove: (item: Item) => void;
  /** Cerrar la hoja: con Guardar, con Borrar, con la X, Escape o el velo. */
  onClose: () => void;
};

/**
 * Hoja de edición de un ítem (nombre, cantidad, unidad, nota) con el borrado
 * en dos toques. Los cambios son optimistas: la hoja se cierra al instante y
 * no espera al servidor. Mientras anima la salida sigue mostrando el último
 * ítem, y cada vez que se abre se arma un formulario nuevo.
 */
export function EditItemSheet({
  item,
  onSave,
  onRemove,
  onClose,
}: EditItemSheetProps) {
  // Lo último que se mostró, para que la salida no se vacíe, y un número de
  // apertura que renueva el formulario aunque se abra el mismo ítem otra vez.
  const [shown, setShown] = useState<{
    item: Item | null;
    session: number;
    open: boolean;
  }>({ item: null, session: 0, open: false });
  if (item) {
    if (!shown.open || shown.item?.id !== item.id) {
      setShown({ item, session: shown.session + 1, open: true });
    } else if (shown.item !== item) {
      setShown({ ...shown, item });
    }
  } else if (shown.open) {
    setShown({ ...shown, open: false });
  }

  const keyboardInset = useKeyboardInset();
  const editedId = shown.item?.id ?? null;

  function returnFocus(event: Event) {
    // Radix no tiene un disparador al que devolver el foco: va al nombre de
    // la fila editada, o al campo de agregar si la fila ya no está.
    event.preventDefault();
    const row =
      editedId === null
        ? null
        : document.querySelector<HTMLElement>(
            `[data-item-id="${CSS.escape(editedId)}"] [data-slot="list-row-name"]`,
          );
    (row ?? document.getElementById(ADD_ITEM_INPUT_ID))?.focus({
      preventScroll: true,
    });
  }

  return (
    <Sheet
      open={shown.open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        data-keyboard-open={keyboardInset > 0}
        // En iOS el teclado no achica el viewport: la hoja sube con él y su
        // alto máximo descuenta lo que el teclado tapa.
        style={{
          bottom: keyboardInset,
          ...(keyboardInset > 0 && {
            maxHeight: `calc(100dvh - ${keyboardInset}px - 1rem)`,
          }),
        }}
        onOpenAutoFocus={(event) => {
          // Sin teclado al abrir: se puede querer solo borrar, y el teclado
          // taparía los botones. El foco va a la hoja, no a un campo.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={returnFocus}
      >
        <SheetHeader>
          <SheetTitle>{texts.editItem.title}</SheetTitle>
        </SheetHeader>
        {shown.item ? (
          <EditForm
            key={shown.session}
            item={shown.item}
            onSave={onSave}
            onRemove={onRemove}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Errors = { name: boolean; quantity: boolean };

function EditForm({
  item,
  onSave,
  onRemove,
  onClose,
}: {
  item: Item;
  onSave: EditItemSheetProps["onSave"];
  onRemove: EditItemSheetProps["onRemove"];
  onClose: () => void;
}) {
  // What the fields were filled with. A field the user did not touch is not
  // sent, so a change another member made to it meanwhile is not undone.
  const [initial] = useState(() => ({
    name: item.name,
    quantity: formatQuantityField(item.quantity),
    unit: item.unit ?? "",
    note: item.note ?? "",
  }));
  const [name, setName] = useState(initial.name);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [unit, setUnit] = useState(initial.unit);
  const [note, setNote] = useState(initial.note);
  const [errors, setErrors] = useState<Errors>({
    name: false,
    quantity: false,
  });
  const [confirming, setConfirming] = useState(false);
  const [armed, setArmed] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const arm = setTimeout(() => setArmed(true), ARM_MS);
    const reset = setTimeout(() => {
      setConfirming(false);
      setArmed(false);
    }, CONFIRM_MS);
    return () => {
      clearTimeout(arm);
      clearTimeout(reset);
    };
  }, [confirming]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const quantityTouched = quantity !== initial.quantity;
    const parsedQuantity = quantityTouched
      ? parseQuantityField(quantity)
      : null;

    const next: Errors = {
      name: trimmedName === "",
      quantity: parsedQuantity === "invalid",
    };
    if (next.name || next.quantity) {
      setErrors(next);
      (next.name ? nameRef : quantityRef).current?.focus();
      return;
    }

    const changes: Partial<EditableFields> = {};
    if (name !== initial.name && trimmedName !== item.name) {
      changes.name = trimmedName;
    }
    if (
      quantityTouched &&
      parsedQuantity !== "invalid" &&
      parsedQuantity !== item.quantity
    ) {
      changes.quantity = parsedQuantity;
    }
    const nextUnit = canonicalUnit(unit);
    if (unit !== initial.unit && nextUnit !== item.unit) {
      changes.unit = nextUnit;
    }
    if (note !== initial.note && (note.trim() || null) !== item.note) {
      changes.note = note.trim() || null;
    }

    if (Object.keys(changes).length > 0) onSave(item, changes);
    onClose();
  }

  function handleRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (!armed) return;
    onRemove(item);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      <SheetBody>
        <Field
          label={texts.editItem.name}
          error={errors.name ? texts.editItem.errors.name : undefined}
        >
          <Input
            ref={nameRef}
            name="name"
            type="text"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: false }));
            }}
          />
        </Field>
        <div className="grid grid-cols-2 items-start gap-4">
          <Field
            label={texts.editItem.quantity}
            error={errors.quantity ? texts.editItem.errors.quantity : undefined}
          >
            <Input
              ref={quantityRef}
              name="quantity"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setErrors((current) => ({ ...current, quantity: false }));
              }}
            />
          </Field>
          <Field label={texts.editItem.unit}>
            <Input
              name="unit"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              enterKeyHint="done"
              maxLength={MAX_UNIT_LENGTH}
              placeholder={texts.editItem.unitPlaceholder}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </Field>
        </div>
        <Field label={texts.editItem.note} help={texts.editItem.noteHelp}>
          <Input
            name="note"
            type="text"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={MAX_NOTE_LENGTH}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </SheetBody>
      <SheetFooter className="in-data-[keyboard-open=true]:pb-4">
        <Button type="submit" size="touch-lg" className="w-full">
          {texts.editItem.save}
        </Button>
        <Button
          type="button"
          variant="danger"
          data-armed={armed}
          // Texto en tinta sobre el fondo de peligro, como en Banner.
          className={cn("w-full", confirming && "bg-danger-bg text-ink")}
          onClick={handleRemove}
        >
          {confirming ? texts.editItem.confirmRemove : texts.editItem.remove}
        </Button>
        <p aria-live="polite" className="sr-only">
          {confirming ? texts.editItem.confirmRemove : ""}
        </p>
      </SheetFooter>
    </form>
  );
}
