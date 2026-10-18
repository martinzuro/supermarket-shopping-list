import * as React from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
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
  /** Oculta el icono de categoría (por defecto se muestra). */
  hideIcon?: boolean;
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
  const icon = props.hideIcon ? null : (
    <CategoryIcon category={props.category} className="size-3.5" />
  );

  if (props.interactive) {
    const {
      category,
      interactive,
      hideIcon,
      selected,
      className,
      children,
      ...rest
    } = props;
    void category;
    void interactive;
    void hideIcon;
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
      >
        {icon}
        {children}
      </button>
    );
  }

  const { category, interactive, hideIcon, className, children, ...rest } =
    props;
  void category;
  void interactive;
  void hideIcon;
  return (
    <span
      data-slot="category-chip"
      style={style}
      className={cn(chipBase, className)}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
