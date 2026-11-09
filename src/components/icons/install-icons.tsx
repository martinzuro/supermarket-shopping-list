import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Iconos propios de las instrucciones para instalar en iOS (F-8): monolínea
 * de 1.5px en una grilla de 24, como los de categoría. Cada uno recuerda lo
 * que hay que buscar en Safari sin copiar el dibujo de Apple: un cuenco con
 * una flecha que sale hacia arriba, y una pantalla con un más.
 */
function Glyph({ className, children, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-5 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** "Compartir": una flecha que sale de un cuenco. */
export function ShareHintIcon(props: React.ComponentProps<"svg">) {
  return (
    <Glyph {...props}>
      <path d="M3.5 13.5c0 4.2 3.4 6.5 8.5 6.5s8.5-2.3 8.5-6.5" />
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
    </Glyph>
  );
}

/** "Agregar a inicio": una pantalla de teléfono con un más. */
export function AddToHomeIcon(props: React.ComponentProps<"svg">) {
  return (
    <Glyph {...props}>
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M12 9v6M9 12h6" />
      <path d="M10.5 19h3" />
    </Glyph>
  );
}
