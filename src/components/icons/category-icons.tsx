import * as React from "react";
import type { CategoryId } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/**
 * Iconos de categoría propios (ADR 0008, decisión 4): monolínea de 1.5px en
 * una grilla de 24, trazo en currentColor para teñirse con la tinta de cada
 * modo. Dibujados para leerse a 14px en un chip y a 20px en una sección.
 */
const glyphs: Record<CategoryId, React.ReactNode> = {
  // Manzana con hoja
  verduras: (
    <>
      <path d="M12 8c-1.6-1.6-5.5-2-6.5 1.5-.9 3.4 1.5 8.3 4 9.4.9.4 1.7-.2 2.5-.2s1.6.6 2.5.2c2.5-1.1 4.9-6 4-9.4C17.5 6 13.6 6.4 12 8Z" />
      <path d="M12 8V5.5" />
      <path d="M12 5.5c.3-1.8 1.8-2.8 3.5-2.5-.3 1.8-1.8 2.8-3.5 2.5Z" />
    </>
  ),
  // Pescado
  carnes: (
    <>
      <path d="M3.5 12c2.6-3.6 6-5.5 9.5-5.5 2.3 0 4 1 5 2.3L21 6.5v11l-3-2.3c-1 1.3-2.7 2.3-5 2.3-3.5 0-6.9-1.9-9.5-5.5Z" />
      <path d="M7.5 11.5h.01" />
    </>
  ),
  // Cuña de queso
  lacteos: (
    <>
      <path d="M3 16.5 20.2 8.2c.5-.2 1 .1 1 .7v8.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1Z" />
      <path d="M3 16.5 20.2 8.2" />
      <circle cx="8" cy="14.5" r="1.1" />
      <circle cx="13.5" cy="12.8" r="0.9" />
      <circle cx="16.5" cy="15.5" r="0.7" />
    </>
  ),
  // Pan de molde con tres cortes
  panaderia: (
    <>
      <path d="M3.5 18.5v-5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7v5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
      <path d="m8 10.5 1.5-1.5M12 10l1.5-1.5M16 10.5l1.5-1.5" />
    </>
  ),
  // Frasco con tapa y etiqueta
  almacen: (
    <>
      <path d="M8 3.5h8V6H8z" />
      <path d="M6 6h12l-.6 12.6a1.5 1.5 0 0 1-1.5 1.4H8.1a1.5 1.5 0 0 1-1.5-1.4L6 6Z" />
      <path d="M9.5 13h5" />
    </>
  ),
  // Botella
  bebidas: (
    <>
      <path d="M10 3h4v3.2l1.5 3.3V19a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V9.5L10 6.2V3Z" />
      <path d="M8.5 13.5h7" />
    </>
  ),
  // Copo de nieve
  congelados: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="m12 3-2 2m2-2 2 2m-2 16-2-2m2 2 2-2" />
      <path d="m4.2 7.5 2.7-.7m-2.7.7.7 2.7M19.8 16.5l-2.7.7m2.7-.7-.7-2.7M19.8 7.5l-2.7-.7m2.7.7-.7 2.7M4.2 16.5l2.7.7m-2.7-.7.7-2.7" />
    </>
  ),
  // Rociador de limpieza
  limpieza: (
    <>
      <path d="M9 10.5h7V19a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-8.5Z" />
      <path d="M12.5 10.5V6M12.5 6H9l-1.5 3.5M12.5 6h2.5v1.5" />
      <path d="M18.5 4.5h.01M20 7h.01M18.5 9.5h.01" />
    </>
  ),
  // Cepillo de dientes, horizontal: mango a la izquierda, cerdas arriba
  higiene: (
    <>
      <path d="M3 16.5h10" />
      <path d="M13 16.5h6.5a1.5 1.5 0 0 0 0-3H13v3Z" />
      <path d="M14.5 13.5v-3M16.5 13.5v-3M18.5 13.5v-3" />
    </>
  ),
  // Bolsa
  otros: (
    <>
      <path d="M5 8.5h14l-1 11a1 1 0 0 1-1 .9H7a1 1 0 0 1-1-.9l-1-11Z" />
      <path d="M9 8.5V6.5a3 3 0 0 1 6 0v2" />
    </>
  ),
};

type CategoryIconProps = Omit<React.ComponentProps<"svg">, "children"> & {
  category: CategoryId;
};

export function CategoryIcon({
  category,
  className,
  strokeWidth = 1.5,
  ...props
}: CategoryIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-slot="category-icon"
      data-category={category}
      className={cn("size-5 shrink-0", className)}
      {...props}
    >
      {glyphs[category]}
    </svg>
  );
}
