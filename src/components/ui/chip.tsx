import * as React from "react";
import type { CategoryId } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

const chipBase =
  "text-label text-ink inline-flex h-7 shrink-0 items-center gap-1.5 rounded-field px-2.5 whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0";

type ChipProps = React.ComponentProps<"span"> & {
  children: React.ReactNode;
};

/** Chip neutro (pistacho) para metadatos cortos. */
export function Chip({ className, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(chipBase, "bg-paper-2", className)}
      {...props}
    />
  );
}

type CategoryChipProps = {
  category: CategoryId;
  children: React.ReactNode;
  className?: string;
} & (
  | ({ interactive?: false } & Omit<React.ComponentProps<"span">, "children">)
  | ({
      interactive: true;
      /** Seleccionado dentro de un selector de categorías. */
      selected?: boolean;
    } & Omit<React.ComponentProps<"button">, "children">)
);

/**
 * Etiqueta de categoría con su tinte. Como `interactive` es un botón
 * (selector de categoría) y marca el seleccionado con un borde de tinta.
 */
export function CategoryChip(props: CategoryChipProps) {
  const style = { background: `var(--cat-${props.category})` };

  if (props.interactive) {
    const { category, interactive, selected, className, ...rest } = props;
    void category;
    void interactive;
    return (
      <button
        type="button"
        data-slot="category-chip"
        aria-pressed={selected}
        style={style}
        className={cn(
          chipBase,
          "duration-instant border border-transparent transition-[border-color,transform] ease-out active:scale-[0.97]",
          selected && "border-ink",
          className,
        )}
        {...rest}
      />
    );
  }

  const { category, interactive, className, ...rest } = props;
  void category;
  void interactive;
  return (
    <span
      data-slot="category-chip"
      style={style}
      className={cn(chipBase, className)}
      {...rest}
    />
  );
}
