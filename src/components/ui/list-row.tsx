"use client";

import * as React from "react";
import { CheckCircle } from "@/components/ui/check-circle";
import { cn } from "@/lib/utils";

type ListRowProps = {
  name: string;
  /** Cantidad y unidad ya formateadas, por ejemplo "1 kg". */
  quantity?: string;
  /**
   * Lo que cuesta la línea, ya formateado ("$ 178"): precio por cantidad.
   * Va en mono bajo la cantidad, alineado a la derecha, como una columna de
   * ticket.
   */
  total?: string;
  /** Nota corta: marca, tamaño, preferencia. */
  note?: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Pulso naranja que se apaga: lo cambió otro miembro. */
  highlighted?: boolean;
  /** Acción al tocar el nombre (editar). Sin ella el nombre es texto. */
  onPress?: () => void;
  trailing?: React.ReactNode;
  /**
   * Etiqueta raíz. `li` por defecto; `div` cuando el `li` lo pone un
   * envoltorio (por ejemplo un elemento de motion) y no puede anidarse.
   */
  as?: "li" | "div";
  className?: string;
};

/**
 * Fila de la lista: 56px, regla inferior, círculo de marcar con objetivo
 * táctil de 44px, tachado animado de izquierda a derecha. Solo anima
 * transform, opacity y color.
 */
export function ListRow({
  name,
  quantity,
  total,
  note,
  checked,
  onCheckedChange,
  highlighted = false,
  onPress,
  trailing,
  as: Root = "li",
  className,
}: ListRowProps) {
  const NameTag = onPress ? "button" : "span";

  return (
    <Root
      data-slot="list-row"
      data-checked={checked}
      data-highlighted={highlighted || undefined}
      className={cn(
        "border-rule text-row min-h-row flex items-center gap-1 border-b transition-colors",
        highlighted
          ? "bg-remote-pulse duration-instant ease-out"
          : "duration-slow bg-transparent ease-out",
        className,
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        // Solo el nombre: el rol y aria-checked ya dicen "casilla, marcada".
        aria-label={name}
        onClick={() => onCheckedChange?.(!checked)}
        className="group/check size-touch -ml-2.5 flex shrink-0 items-center justify-center rounded-full"
      >
        <CheckCircle
          checked={checked}
          className="group-active/check:scale-90"
        />
      </button>

      <NameTag
        data-slot="list-row-name"
        type={onPress ? "button" : undefined}
        // Tocar el nombre abre la hoja de edición.
        aria-haspopup={onPress ? "dialog" : undefined}
        onClick={onPress}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-start gap-0.5 py-2 text-left",
          onPress && "min-h-touch rounded-field justify-center",
        )}
      >
        <span className="relative max-w-full">
          <span
            className={cn(
              "duration-base block truncate transition-colors ease-out",
              checked ? "text-ink-2" : "text-ink",
            )}
          >
            {name}
          </span>
          <span
            aria-hidden
            className={cn(
              "bg-ink-2 duration-base absolute top-1/2 left-0 h-px w-full origin-left transition-transform ease-out",
              checked ? "scale-x-100" : "scale-x-0",
            )}
          />
        </span>
        {note ? <span className="eyebrow truncate">{note}</span> : null}
      </NameTag>

      {quantity || total ? (
        <span
          data-slot="list-row-figures"
          className="text-label text-ink-2 flex shrink-0 flex-col items-end pl-3 font-mono"
        >
          {quantity ? <span data-numeric>{quantity}</span> : null}
          {total ? (
            <span data-numeric data-slot="list-row-total">
              {total}
            </span>
          ) : null}
        </span>
      ) : null}
      {trailing}
    </Root>
  );
}
