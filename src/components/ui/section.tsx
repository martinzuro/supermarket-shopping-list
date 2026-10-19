import * as React from "react";
import type { CategoryId } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

type SectionProps = {
  id: string;
  title: string;
  /** Conteo a la derecha del título, en mono. */
  count?: number;
  /** Categoría cuyo hilo de 2px acompaña la sección. */
  thread?: CategoryId;
  /**
   * Nivel del encabezado. 3 para una agrupación dentro de otra sección (las
   * categorías dentro de "Pendientes"): conserva el orden de títulos y se
   * lee un escalón por debajo.
   */
  level?: 2 | 3;
  /** Eyebrow encima del título. */
  eyebrow?: string;
  /** Icono a la izquierda del título (por ejemplo CategoryIcon). */
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Agrupación de la lista: título como encabezado, conteo opcional e hilo de
 * categoría. Las filas van dentro; la separación la dan las reglas, no las
 * tarjetas.
 */
export function Section({
  id,
  title,
  count,
  thread,
  level = 2,
  eyebrow,
  icon,
  action,
  className,
  children,
}: SectionProps) {
  const headingId = `${id}-heading`;
  const Heading = level === 3 ? "h3" : "h2";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="section"
      style={
        thread ? { borderColor: `var(--cat-${thread}-thread)` } : undefined
      }
      className={cn("py-4", thread && "border-l-2 pl-4", className)}
    >
      <div className="min-h-touch flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <Heading
            id={headingId}
            className={cn(
              "flex min-w-0 items-center gap-2",
              level === 3 ? "text-row font-medium" : "text-heading",
            )}
          >
            {icon ? (
              <span className="text-ink-2 flex shrink-0">{icon}</span>
            ) : null}
            {/* El recorte con puntos suspensivos solo funciona en un bloque
                propio, no en el texto suelto de un contenedor flex. */}
            <span className="truncate">{title}</span>
            {typeof count === "number" ? (
              <span data-numeric className="text-ink-2 text-label font-mono">
                {count}
              </span>
            ) : null}
          </Heading>
        </div>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Texto de estado vacío dentro de una sección. */
export function SectionEmpty({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="section-empty"
      className={cn("text-ink-2 py-3 text-pretty", className)}
      {...props}
    />
  );
}
