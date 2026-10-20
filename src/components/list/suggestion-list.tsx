import type { MouseEvent } from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
import type { CategoryId } from "@/lib/design/tokens";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

export type Suggestion = {
  /** Estable entre renders: el nombre normalizado del catálogo. */
  key: string;
  name: string;
  category: CategoryId;
  /** El último precio, ya formateado ("$ 45"). */
  price: string | null;
  /**
   * Ya está pendiente: en lugar del precio dice "En la lista", con su
   * cantidad. Elegirla no agrega otra fila (docs/improvements.md, A-2).
   */
  inList?: string;
};

export function optionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}

type SuggestionListProps = {
  id: string;
  /** De arriba hacia abajo: la mejor queda pegada al campo. */
  options: readonly Suggestion[];
  activeKey: string | null;
  onPick: (key: string, event: MouseEvent<HTMLElement>) => void;
};

/**
 * Las opciones del autocompletado del campo de añadir (ARIA 1.2: el campo
 * es el combobox y mantiene el foco; esto es su listbox). Papel y reglas de
 * 1px, sin sombra. Lo que ya está pendiente va primero y lo dice. Tocar una
 * opción no le saca el foco al campo, así el teclado del teléfono no se
 * cierra.
 */
export function SuggestionList({
  id,
  options,
  activeKey,
  onPick,
}: SuggestionListProps) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={texts.addItem.suggestions}
      data-slot="suggestion-list"
      className="divide-rule divide-y"
    >
      {options.map((option, index) => {
        const active = option.key === activeKey;
        return (
          <li
            key={option.key}
            id={optionId(id, index)}
            role="option"
            aria-selected={active}
            data-active={active || undefined}
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => onPick(option.key, event)}
            className={cn(
              "text-row min-h-touch duration-instant -mx-3 flex cursor-pointer items-center gap-3 px-3 transition-colors ease-out",
              "hover:bg-paper-hover active:bg-paper-pressed data-active:bg-paper-2",
            )}
          >
            <CategoryIcon category={option.category} className="text-ink-2" />
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
            {option.inList ? (
              <span
                data-slot="suggestion-in-list"
                className="text-label text-ink-2 shrink-0"
              >
                {option.inList}
              </span>
            ) : option.price ? (
              <span
                data-numeric
                className="text-label text-ink-2 shrink-0 font-mono"
              >
                {option.price}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
