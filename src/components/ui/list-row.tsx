"use client";

import * as React from "react";
import { CheckCircle } from "@/components/ui/check-circle";
import { cn } from "@/lib/utils";

type ListRowProps = {
  name: string;
  /** Cantidad y unidad ya formateadas, por ejemplo "1 kg". */
  quantity?: string;
  /** Nota corta: marca, tamaño, preferencia. */
  note?: string;
  checked: boolean;
  /** Texto accesible del control de marcar. */
  toggleLabel: string;
  onCheckedChange?: (checked: boolean) => void;
  /** Pulso naranja que se apaga: lo cambió otro miembro. */
  highlighted?: boolean;
  /** Acción al tocar el nombre (editar). Sin ella el nombre es texto. */
  onPress?: () => void;
  trailing?: React.ReactNode;
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
  note,
  checked,
  toggleLabel,
  onCheckedChange,
  highlighted = false,
  onPress,
  trailing,
  className,
}: ListRowProps) {
  const NameTag = onPress ? "button" : "span";

  return (
    <li
      data-slot="list-row"
      data-checked={checked}
      className={cn(
        "border-rule text-row min-h-row flex items-center gap-1 border-b transition-colors",
        highlighted
          ? "bg-remote-pulse duration-instant"
          : "duration-slow bg-transparent ease-out",
        className,
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={toggleLabel}
        onClick={() => onCheckedChange?.(!checked)}
        className="group/check size-touch -ml-2.5 flex shrink-0 items-center justify-center rounded-full"
      >
        <CheckCircle
          checked={checked}
          className="group-active/check:scale-90"
        />
      </button>

      <NameTag
        type={onPress ? "button" : undefined}
        onClick={onPress}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-start gap-0.5 py-2 text-left",
          onPress && "rounded-field",
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

      {quantity ? (
        <span
          data-numeric
          className={cn("text-label shrink-0 pl-3 font-mono", "text-ink-2")}
        >
          {quantity}
        </span>
      ) : null}
      {trailing}
    </li>
  );
}
