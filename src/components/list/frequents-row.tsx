import { Plus } from "lucide-react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

export type Frequent = { key: string; name: string };

type FrequentsRowProps = {
  /** Cuántos productos agrega "Lo de siempre"; 0 si no se ofrece. */
  usualsCount: number;
  products: readonly Frequent[];
  onUsuals: (event: MouseEvent<HTMLButtonElement>) => void;
  onPick: (key: string, event: MouseEvent<HTMLButtonElement>) => void;
};

/** Tocar no le saca el foco al campo: el teclado no se cierra. */
const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault();

/**
 * Productos de un toque sobre el campo vacío: primero "Lo de siempre" con su
 * cuenta (abre el repaso), después los más frecuentes, en una fila que se
 * desplaza de costado (sin barra). Las píldoras miden 36px y su área táctil
 * llega a 44px.
 */
export function FrequentsRow({
  usualsCount,
  products,
  onUsuals,
  onPick,
}: FrequentsRowProps) {
  // 36px + 1px of border on each side + 4px above and below = 44px; the 4px
  // are the scroller's own vertical padding. (The pseudo-element is placed
  // from the padding box, hence 5.)
  const hit =
    "relative before:absolute before:inset-x-0 before:top-[-5px] before:bottom-[-5px] before:content-['']";
  return (
    <div
      role="group"
      aria-label={texts.addItem.frequents}
      data-slot="frequents-row"
      className="px-safe flex [scrollbar-width:none] gap-2 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden"
    >
      {usualsCount > 0 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-slot="usuals"
          aria-label={texts.addItem.usuals.aria(usualsCount)}
          // Abre el repaso (A-3), no agrega todavía.
          aria-haspopup="dialog"
          className={hit}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={onUsuals}
        >
          {texts.addItem.usuals.label}
          <span data-numeric className="font-mono">
            {usualsCount}
          </span>
        </Button>
      ) : null}
      {products.map((product) => (
        <Button
          key={product.key}
          type="button"
          variant="outline"
          size="sm"
          data-slot="frequent"
          aria-label={texts.addItem.addProduct(product.name)}
          className={hit}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={(event) => onPick(product.key, event)}
        >
          <Plus aria-hidden strokeWidth={2} className="text-ink-2 size-3.5" />
          {product.name}
        </Button>
      ))}
    </div>
  );
}
