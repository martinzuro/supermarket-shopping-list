import * as React from "react";
import { cn } from "@/lib/utils";

type EyebrowProps<T extends React.ElementType> = {
  as?: T;
  /** `ink` para eyebrows que son título; por defecto tinta secundaria. */
  tone?: "muted" | "ink";
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

/**
 * Microetiqueta en mayúsculas: el sistema de metadatos de la interfaz
 * (categoría, fecha, quién agregó, títulos de sección secundarios).
 */
export function Eyebrow<T extends React.ElementType = "p">({
  as,
  tone = "muted",
  className,
  children,
  ...props
}: EyebrowProps<T>) {
  const Comp = as ?? "p";
  return (
    <Comp
      data-slot="eyebrow"
      className={cn("eyebrow", tone === "ink" && "text-ink", className)}
      {...props}
    >
      {children}
    </Comp>
  );
}
